const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const express = require('express');
const jwt = require('jsonwebtoken');
const { MONGO_URI, SECRET_KEY } = require('../config');

test('custom status saves, classifies passenger stations, validates, and can be removed', async () => {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  let db, server;
  try {
    await client.connect();
    db = client.db(`mfu_settings_test_${randomUUID().replaceAll('-', '')}`);
    require('../db').getDB = () => db;
    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/settings'));
    app.use('/station', require('../routes/station'));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const admin = jwt.sign({ role: 'admin' }, SECRET_KEY);
    const user = jwt.sign({ role: 'user' }, SECRET_KEY);
    const request = (body, token = admin) => fetch(`${base}/api/settings/crowd-thresholds`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
    });
    const read = async () => (await fetch(`${base}/api/settings/crowd-thresholds`, { headers: { Authorization: `Bearer ${admin}` } })).json();
    const original = await read();
    assert.deepEqual(original.customStatuses, []);
    const custom = { id: 'custom_critical', name: 'หนาแน่นมาก', min: 20, max: null, color: '#812ABC' };
    const data = { ...original, high: { min: 10, max: 19 }, customStatuses: [custom] };
    assert.equal((await request(data, '')).status, 401);
    assert.equal((await request(data, user)).status, 403);
    assert.equal((await request(data)).status, 200);
    const saved = await read();
    assert.equal(saved.customStatuses[0].color, '#812abc');
    assert.equal(saved.customStatuses[0].name, custom.name);
    await db.collection('stations').insertMany([19, 20, 100].map(waiting => ({ id: `s${waiting}`, name: 'Station', lines: ['line1'], waiting })));
    const stations = await (await fetch(`${base}/station/line1`)).json();
    assert.equal(stations.find(s => s.waiting === 19).status, 'HIGH');
    for (const count of [20, 100]) {
      const station = stations.find(s => s.waiting === count);
      assert.equal(station.status, custom.id);
      assert.equal(station.statusLabel, custom.name);
      assert.equal(station.statusColor, '#812abc');
    }
    for (const invalid of [
      { ...data, high: { min: 10, max: null } },
      { ...data, customStatuses: [{ ...custom, min: 19 }] },
      { ...data, customStatuses: [{ ...custom, name: '' }] },
      { ...data, customStatuses: [{ ...custom, name: 'High' }] },
      { ...data, customStatuses: [{ ...custom, id: 'HIGH' }] },
      { ...data, customStatuses: [{ ...custom, color: 'red' }] },
      { ...data, customStatuses: [custom, custom] },
    ]) {
      assert.equal((await request(invalid)).status, 400);
      assert.deepEqual(await read(), saved);
    }
    assert.equal((await request({ ...saved, customStatuses: [], high: { min: 10, max: null } })).status, 200);
    assert.deepEqual((await read()).customStatuses, []);
    assert.ok((await (await fetch(`${base}/station/line1`)).json()).every(s => s.status === 'HIGH'));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.dropDatabase();
    await client.close();
  }
});
