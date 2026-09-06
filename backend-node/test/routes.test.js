const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const express = require('express');
const jwt = require('jsonwebtoken');
const { MONGO_URI, SECRET_KEY } = require('../config');
const { initializeRoutes } = require('../services/routes');

test('routes persist safely and support additional lines throughout the API', async () => {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  const dbName = `mfu_routes_test_${randomUUID().replaceAll('-', '')}`;
  let server;
  try {
    await client.connect();
    const db = client.db(dbName);
    require('../db').getDB = () => db;
    await initializeRoutes(db);
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api', require('../routes/route.routes'));
    app.use('/station', require('../routes/station'));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const admin = jwt.sign({ username: 'route-test', role: 'admin' }, SECRET_KEY);
    const user = jwt.sign({ username: 'route-test-user', role: 'user' }, SECRET_KEY);
    async function request(path, method = 'GET', body, token) {
      return fetch(base + path, { method, headers: {
        'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }, body: body === undefined ? undefined : JSON.stringify(body) });
    }
    const defaults = await (await request('/api/routes')).json();
    assert.equal(defaults.length, 2);
    assert.equal(defaults[0].geometry.coordinates.length, 421);
    assert.equal(defaults[1].geometry.coordinates.length, 414);
    assert.match(defaults[0].nameTH, /[\u0e00-\u0e7f]/);
    assert.equal((await request('/api/routes/admin')).status, 401);
    assert.equal((await request('/api/routes/admin', 'GET', undefined, user)).status, 403);
    const route = { id: 'line3', name: 'Line 3', nameTH: '', color: '#336699', enabled: true,
      geometry: { type: 'LineString', coordinates: [[99.89, 20.04], [99.90, 20.05], [99.91, 20.06]] } };
    assert.equal((await request('/api/routes', 'POST', route)).status, 401);
    assert.equal((await request('/api/routes', 'POST', route, user)).status, 403);
    for (const invalid of [{}, { ...route, id: 'all' }, { ...route, id: { $ne: '' } }, { ...route, color: 'red' },
      { ...route, enabled: 'true' }, { ...route, geometry: { type: 'Polygon', coordinates: route.geometry.coordinates } },
      { ...route, geometry: { type: 'LineString', coordinates: [[99, 20]] } },
      { ...route, geometry: { type: 'LineString', coordinates: [[99, 20], [99, 20]] } },
      { ...route, geometry: { type: 'LineString', coordinates: [[181, 20], [99, 20]] } },
      { ...route, geometry: { type: 'LineString', coordinates: [[99, 20], ['99', 21]] } },
      { ...route, geometry: { type: 'LineString', coordinates: Array.from({ length: 5001 }, (_, i) => [99, 20 + i / 10000]) } },
    ]) assert.equal((await request('/api/routes', 'POST', invalid, admin)).status, 400);
    const createdResponse = await request('/api/routes', 'POST', route, admin);
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.revision, 1);
    assert.equal((await request('/api/routes', 'POST', route, admin)).status, 409);
    const edit = { ...created, geometry: { type: 'LineString', coordinates: [[99.895, 20.041], [99.90, 20.053]] } };
    const concurrent = await Promise.all([request('/api/routes/line3', 'PUT', edit, admin), request('/api/routes/line3', 'PUT', edit, admin)]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    const saved = await db.collection('routes').findOne({ id: 'line3' });
    assert.deepEqual(saved.geometry, edit.geometry);
    assert.equal(saved.revision, 2);
    const station = { id: 'test-stop', name: 'New stop', lat: 20.04, lng: 99.89, lines: ['line3'] };
    assert.equal((await request('/station/admin', 'POST', station, admin)).status, 201);
    assert.equal((await (await request('/station/line3')).json()).length, 1);
    assert.equal((await request('/station/admin/test-stop', 'PUT', { lines: ['unknown'] }, admin)).status, 400);
    assert.equal((await request('/api/routes/line3', 'PUT', { ...saved, enabled: false }, admin)).status, 200);
    assert.equal((await (await request('/api/routes')).json()).some(item => item.id === 'line3'), false);
    assert.equal((await (await request('/api/routes/admin', 'GET', undefined, admin)).json()).length, 3);
    await db.collection('routes').updateOne({ id: 'line1' }, { $set: { name: 'Saved custom name', enabled: false } });
    await initializeRoutes(db);
    assert.equal((await db.collection('routes').findOne({ id: 'line1' })).name, 'Saved custom name');
    assert.equal((await db.collection('routes').findOne({ id: 'line1' })).enabled, false);
    assert.equal(await db.collection('stations').countDocuments(), 1);
    assert.equal((await request('/api/routes/line3', 'DELETE', { revision: 3 })).status, 401);
    assert.equal((await request('/api/routes/line3', 'DELETE', { revision: 3 }, user)).status, 403);
    assert.equal((await request('/api/routes/line3', 'DELETE', {}, admin)).status, 400);
    assert.equal((await request('/api/routes/missing', 'DELETE', { revision: 1 }, admin)).status, 404);
    assert.equal((await request('/api/routes/line3', 'DELETE', { revision: 1 }, admin)).status, 409);
    // An assigned station blocks deletion without removing either record.
    assert.equal((await request('/api/routes/line3', 'DELETE', { revision: 3 }, admin)).status, 409);
    assert.equal((await request('/station/admin/test-stop', 'PUT', { lines: ['line2'] }, admin)).status, 200);
    for (const line of ['line3', '3']) {
      await db.collection('buses').insertOne({ busNumber: 'test-delete', line });
      assert.equal((await request('/api/routes/line3', 'DELETE', { revision: 3 }, admin)).status, 409);
      await db.collection('buses').deleteOne({ busNumber: 'test-delete' });
    }
    assert.equal((await request('/api/routes/line3', 'DELETE', { revision: 3 }, admin)).status, 200);
    assert.equal((await (await request('/api/routes/admin', 'GET', undefined, admin)).json()).some(item => item.id === 'line3'), false);
    assert.equal((await request('/api/routes/line3', 'DELETE', { revision: 3 }, admin)).status, 404);
    assert.equal((await request('/api/routes/line3', 'PUT', { ...saved, revision: 4 }, admin)).status, 409);
    assert.equal((await request('/station/admin/test-stop', 'PUT', { lines: ['line3'] }, admin)).status, 400);
    // Default line deletion persists across initialization too.
    assert.equal((await request('/api/routes/line1', 'DELETE', { revision: 1 }, admin)).status, 200);
    await initializeRoutes(db);
    assert.equal((await (await request('/api/routes/admin', 'GET', undefined, admin)).json()).some(item => item.id === 'line1'), false);
    const recreated = await request('/api/routes', 'POST', route, admin);
    assert.equal(recreated.status, 201);
    assert.equal((await recreated.json()).revision, 5);
    assert.equal((await request('/api/routes/line3', 'PUT', { ...saved, revision: 3 }, admin)).status, 409);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});
