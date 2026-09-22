const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const express = require('express');
const jwt = require('jsonwebtoken');
const { MONGO_URI, SECRET_KEY } = require('../config');
// This test owns a temporary Mongo database. Never send its rows to live users.
process.env.SUPABASE_SECRET_KEY = '';
const { initializeRoutes } = require('../services/routes');

test('public data API, admin changes and detector writes agree without reloading unchanged polylines', async t => {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  const dbName = `mfu_public_test_${randomUUID().replaceAll('-', '')}`;
  let server, db;
  try {
    await client.connect(); db = client.db(dbName);
    require('../db').getDB = () => db;
    await initializeRoutes(db);
    const fixtures = require('../../docker/mongo-init/backup/shuttlebus_system.stations.json')
      .map(({ _id, ...station }) => ({ ...station, cameraUrl: 'PRIVATE_CAMERA_SENTINEL', detectionRoi: [[0, 0], [1, 1]] }));
    await db.collection('stations').insertMany(fixtures);
    const publicData = require('../services/public-data-runtime');
    assert.equal(publicData.realtimeStatus().configured, false);
    const app = express(); app.use(express.json());
    app.use('/api', require('../routes/public-data.routes'));
    app.use('/api', require('../routes/route.routes'));
    app.use('/api', require('../routes/settings'));
    app.use('/station', require('../routes/station'));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = jwt.sign({ username: 'public-data-test', role: 'admin' }, SECRET_KEY);
    async function request(path, method = 'GET', body) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body) });
      assert.ok(response.ok, `${method} ${path}: ${response.status}`);
      return response.json();
    }
    const compactPath = value => `/api/public-data?catalogVersion=${value.catalogVersion}&routesVersion=${value.catalog.routesVersion}`;
    const initial = await request('/api/public-data');
    assert.equal(initial.catalog.routes.length, 2);
    assert.equal(initial.catalog.stations.length, fixtures.length);
    assert.equal(JSON.stringify(initial).includes('PRIVATE_CAMERA_SENTINEL'), false);
    assert.equal(JSON.stringify(initial).includes('detectionRoi'), false);
    assert.equal(initial.catalog.stations[0].waiting, undefined);
    const compact = await request(compactPath(initial));
    assert.equal(compact.catalog, undefined);
    assert.equal(compact.sequence, initial.sequence);
    const initialBytes = Buffer.byteLength(JSON.stringify(initial)), compactBytes = Buffer.byteLength(JSON.stringify(compact));
    assert.ok(compactBytes < initialBytes / 5);
    t.diagnostic(`Real route fixtures: initial ${initialBytes} bytes; unchanged catalog response ${compactBytes} bytes (${Math.round(100 * (1 - compactBytes / initialBytes))}% less JSON).`);
    // Python bypasses HTTP and writes counts directly to MongoDB.
    await db.collection('stations').updateOne({ id: 'station01' }, { $set: { waiting: 9 } });
    await publicData.refresh();
    const detected = await request(compactPath(initial));
    assert.equal(detected.catalog, undefined);
    assert.equal(detected.stations.find(station => station.id === 'station01').waiting, 9);
    assert.equal(detected.stations.find(station => station.id === 'station01').status, 'MEDIUM');
    const counts = await Promise.all(Array.from({ length: 100 }, () => request(compactPath(initial))));
    assert.ok(counts.every(result => result.sequence === detected.sequence && !result.catalog));

    const added = { id: 'future-stop', name: 'Future stop', nameTH: 'New', lat: 20.05, lng: 99.89, lines: ['line1'], waiting: 3 };
    await request('/station/admin', 'POST', added);
    const withAdded = await request(compactPath(initial));
    assert.equal(withAdded.catalog.routes, undefined);
    assert.equal(withAdded.catalog.stations.at(-1)?.id === 'future-stop' || withAdded.catalog.stations.some(station => station.id === 'future-stop'), true);
    assert.equal(withAdded.stations.find(station => station.id === 'future-stop').waiting, 3);
    await request('/station/admin/future-stop', 'PUT', { name: 'Renamed', lat: 20.06, routeBearings: { line1: 90 } });
    const renamed = await request(compactPath(withAdded));
    assert.equal(renamed.catalog.routes, undefined);
    assert.equal(renamed.catalog.stations.find(station => station.id === 'future-stop').name, 'Renamed');
    assert.deepEqual(renamed.catalog.stations.find(station => station.id === 'future-stop').routeBearings, { line1: 90 });
    await request('/station/admin/future-stop', 'DELETE');
    const removed = await request(compactPath(renamed));
    assert.equal(removed.catalog.stations.some(station => station.id === 'future-stop'), false);
    assert.equal(removed.stations.some(station => station.id === 'future-stop'), false);

    const thresholds = await request('/api/settings/crowd-thresholds');
    await request('/api/settings/crowd-thresholds', 'PUT', { ...thresholds, colors: { ...thresholds.colors, medium: '#112233' } });
    await publicData.refresh();
    const recolored = await request(compactPath(removed));
    assert.equal(recolored.catalog, undefined);
    assert.equal(recolored.stations.find(station => station.id === 'station01').statusColor, '#112233');
    const line = initial.catalog.routes.find(route => route.id === 'line1');
    const changed = await request('/api/routes/line1', 'PUT', { ...line, geometry: { type: 'LineString', coordinates: [[99.89, 20.04], [99.90, 20.05]] } });
    const newRoute = await request(compactPath(removed));
    assert.deepEqual(newRoute.catalog.routes.find(route => route.id === 'line1').geometry, changed.geometry);
    assert.notEqual(newRoute.catalog.routesVersion, initial.catalog.routesVersion);
    await request('/api/routes/line1', 'PUT', { ...changed, enabled: false });
    const onlyLine2 = await request(compactPath(newRoute));
    assert.deepEqual(onlyLine2.catalog.routes.map(route => route.id), ['line2']);
    assert.ok(onlyLine2.catalog.stations.every(station => station.lines.includes('line2')));
    const line2 = onlyLine2.catalog.routes[0];
    await request('/api/routes/line2', 'PUT', { ...line2, enabled: false });
    const empty = await request(compactPath(onlyLine2));
    assert.deepEqual(empty.catalog.routes, []); assert.deepEqual(empty.catalog.stations, []); assert.deepEqual(empty.stations, []);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.dropDatabase();
    await client.close();
  }
});
