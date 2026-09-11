const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { PpgpsClient, GpsError, normalizeTracker, createGpsService } = require('../services/gps');

const timestamp = 1788856085000;
const vehicle = { busId: 'MFU03', imei: 'test-device', line: null };
const sample = { id: '73849', imei: vehicle.imei, lat: 20.058967, lng: 99.899742, time: timestamp / 1000,
  speed: 0, cardirection: 114, alarm: 'จอดรถ,เครื่องยนต์ทำงาน', username: 'must-not-leak' };
const config = { enabled: true, username: 'test', password: 'test-pass', pollMs: 5000,
  staleMs: 120000, timeoutMs: 1000, speedUnit: 'unknown' };

async function provider(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('sign-in, session rotation, form encoding and one re-login after session expiry', async t => {
  let logins = 0, expired = false;
  const cookies = [], forms = [];
  const baseUrl = await provider(t, async (req, res) => {
    if (req.url === '/index.php') {
      res.setHeader('Set-Cookie', ['PHPSESSID=initial; Path=/', 'password=remembered-secret; Path=/']);
      return res.end('<form action="/login.php"><input name="password"></form>');
    }
    if (req.url === '/login.php') {
      assert.equal(req.method, 'POST');
      let body = ''; for await (const part of req) body += part;
      forms.push(new URLSearchParams(body));
      logins++;
      res.writeHead(302, { 'Set-Cookie': `PHPSESSID=session${logins}; Path=/`, Location: '/map.php' });
      return res.end();
    }
    if (req.url === '/map.php') return res.end('map');
    cookies.push(req.headers.cookie);
    if (expired && logins === 1) return res.end('<form action="/login.php"><input name="password"></form>');
    assert.equal(req.headers.cookie, `PHPSESSID=session${logins}`);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([sample]));
  });
  const client = new PpgpsClient({ ...config, baseUrl, password: 'p&=+# ไทย' });
  assert.deepEqual(await client.getTrackers(), [sample]);
  expired = true;
  assert.deepEqual(await client.getTrackers(), [sample]);
  assert.equal(logins, 2);
  assert.equal(forms[0].get('password'), 'p&=+# ไทย');
  assert.equal(forms[0].has('remember'), false);
  assert.ok(cookies.every(cookie => !cookie.includes('password')));
});

test('incorrect credentials stop after one login and produce no credential-bearing error', async t => {
  let logins = 0;
  const baseUrl = await provider(t, (req, res) => {
    if (req.url === '/login.php') logins++;
    res.setHeader('Set-Cookie', 'PHPSESSID=anonymous; Path=/');
    res.end('<form action="/login.php"><input name="password"></form>');
  });
  const client = new PpgpsClient({ ...config, baseUrl });
  await assert.rejects(client.getTrackers(), { message: 'authentication_failed' });
  assert.equal(logins, 1);
  assert.equal(client.session, '');
});

test('redirects cannot forward login credentials or cookies to another origin', async t => {
  let outbound = 0;
  const other = await provider(t, (req, res) => { outbound++; res.end('unexpected'); });
  const baseUrl = await provider(t, (req, res) => {
    if (req.method === 'POST') res.writeHead(307, { Location: `${other}/capture` });
    else res.setHeader('Set-Cookie', 'PHPSESSID=initial; Path=/');
    res.end('');
  });
  await assert.rejects(new PpgpsClient({ ...config, baseUrl }).getTrackers(), { message: 'redirect_error' });
  assert.equal(outbound, 0);
});

test('non-JSON response is not accepted as successful authentication or retried as login', async t => {
  let logins = 0;
  const baseUrl = await provider(t, (req, res) => {
    if (req.url === '/login.php') logins++;
    res.setHeader('Set-Cookie', 'PHPSESSID=test; Path=/');
    res.end('upstream unavailable');
  });
  await assert.rejects(new PpgpsClient({ ...config, baseUrl }).getTrackers(), { message: 'invalid_response' });
  assert.equal(logins, 1);
});

test('normalization validates coordinates and Unix seconds without guessing speed units', () => {
  const row = normalizeTracker(sample, vehicle, timestamp);
  assert.equal(row.lastGpsAt.toISOString(), '2026-09-08T08:28:05.000Z');
  assert.equal(row.movement, 'stopped');
  assert.equal(row.speedKph, null);
  assert.equal(row.username, undefined);
  assert.equal(normalizeTracker({ ...sample, speed: 10 }, vehicle, timestamp, 'mph').speedKph, 16.09344);
  for (const changes of [{ lat: null }, { lat: '' }, { lng: 181 }, { lat: 0, lng: 0 },
    { time: timestamp }, { time: timestamp / 1000 + 120 }, { lat: NaN }]) {
    assert.throws(() => normalizeTracker({ ...sample, ...changes }, vehicle, timestamp), GpsError);
  }
});

function memoryDB() {
  const records = new Map([['legacy', { _id: 'legacy', busNumber: '1', status: 'RUNNING' }]]);
  let writes = 0;
  const collection = {
    async findOne(query) { return records.get(query._id); },
    async updateOne(query, update) { writes++; records.set(query._id, { _id: query._id, ...update.$set }); },
    find(query) { return { async toArray() { return [...records.values()].filter(row => row.source === query.source); } }; },
  };
  return { collection: () => collection, records, writes: () => writes };
}

test('fresh/stale/unknown, upstream failure, older points, registry and public-field projection', async () => {
  let clock = timestamp, data = [sample], fail = false;
  const db = memoryDB();
  const gps = createGpsService({ config, vehicles: [vehicle], getDB: () => db, now: () => clock,
    client: { async getTrackers() { if (fail) throw new GpsError('connection_error'); return data; } } });
  assert.equal((await gps.buses())[0].connectionStatus, 'unknown');
  await gps.sync();
  let buses = await gps.buses();
  assert.equal(buses.length, 1);
  assert.equal(buses[0].connectionStatus, 'fresh');
  assert.equal(buses[0].status, 'STOPPED');
  assert.equal(buses[0].imei, undefined);
  assert.equal(buses[0].providerId, undefined);
  assert.equal(buses[0].line, null);
  assert.ok(db.records.has('legacy'));
  clock += 121000;
  await gps.sync();
  assert.equal((await gps.buses())[0].connectionStatus, 'stale');
  fail = true;
  await gps.sync();
  buses = await gps.buses();
  assert.equal(buses[0].connectionStatus, 'unknown');
  assert.equal(buses[0].lat, sample.lat);
  fail = false;
  data = [{ ...sample, lat: 21, time: sample.time - 60 }];
  await gps.sync();
  assert.equal((await gps.buses())[0].lat, sample.lat);
  data = [];
  assert.equal((await gps.sync()).state, 'empty_data');
  assert.equal((await gps.buses())[0].lat, sample.lat);
  data = [{ ...sample, imei: 'unrelated-account-device' }];
  assert.equal((await gps.sync()).unmappedCount, 1);
  assert.equal(db.records.size, 2);
});

test('no credentials means no provider calls/writes; failures and status never expose secrets', async () => {
  const db = memoryDB();
  let calls = 0;
  const gps = createGpsService({ config: { ...config, password: '' }, vehicles: [vehicle], getDB: () => db,
    client: { async getTrackers() { calls++; return [sample]; } } });
  gps.start(); await gps.sync(); gps.stop();
  assert.equal(calls, 0); assert.equal(db.writes(), 0);
  assert.equal(gps.status().state, 'unconfigured');
  assert.equal(JSON.stringify(gps.status()).includes(config.password), false);
});

test('concurrent sync calls share one upstream request and one set of database writes', async () => {
  const db = memoryDB();
  let calls = 0, resolve;
  const pending = new Promise(done => { resolve = done; });
  const gps = createGpsService({ config, vehicles: [vehicle], getDB: () => db, now: () => timestamp,
    client: { async getTrackers() { calls++; await pending; return [sample]; } } });
  const a = gps.sync(), b = gps.sync();
  resolve();
  await Promise.all([a, b]);
  assert.equal(calls, 1); assert.equal(db.writes(), 1);
});

test('bus API keeps the array contract and restricts connection diagnostics to admins', async t => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const { SECRET_KEY } = require('../config');
  const runtime = require('../services/gps-runtime');
  t.mock.method(runtime, 'buses', async () => [{ busId: 'MFU03', connectionStatus: 'unknown' }]);
  t.mock.method(runtime, 'status', () => ({ state: 'unconfigured', configured: false, healthy: false }));
  const app = express();
  app.use('/api', require('../routes/bus.routes'));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api/buses`;
  const publicResponse = await fetch(base);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await publicResponse.json(), [{ busId: 'MFU03', connectionStatus: 'unknown' }]);
  assert.equal((await fetch(`${base}/gps-status`)).status, 401);
  for (const [role, expected] of [['user', 403], ['admin', 200]]) {
    const token = jwt.sign({ role }, SECRET_KEY);
    const response = await fetch(`${base}/gps-status`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, expected);
  }
  t.mock.method(runtime, 'buses', async () => { throw new Error('database-secret'); });
  const failed = await fetch(base);
  assert.equal(failed.status, 500);
  assert.equal((await failed.text()).includes('database-secret'), false);
});

test('timeouts are bounded and invalid vehicles do not replace validated positions', async t => {
  const baseUrl = await provider(t, (req, res) => { /* Hold response until the client aborts. */ });
  await assert.rejects(new PpgpsClient({ ...config, baseUrl, timeoutMs: 50 }).getTrackers(), { message: 'connection_error' });
  const db = memoryDB();
  let rows = [sample];
  const gps = createGpsService({ config, vehicles: [vehicle], getDB: () => db, now: () => timestamp,
    client: { async getTrackers() { return rows; } } });
  await gps.sync();
  rows = [{ ...sample, lat: null }];
  assert.equal((await gps.sync()).state, 'invalid_data');
  assert.equal((await gps.buses())[0].lat, sample.lat);
  assert.equal(db.writes(), 1);
});
