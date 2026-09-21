import test from 'node:test'
import assert from 'node:assert/strict'
import { startPublicDataFeed } from '../src/services/publicDataFeed.ts'

const flush = () => new Promise(resolve => setImmediate(resolve))
const version = 'a'.repeat(64), routesVersion = 'b'.repeat(64)
const crowd = (id, waiting) => ({ id, waiting, status: 'LOW', statusColor: '#123456', statusLabel: '' })
const catalog = { version, routesVersion, stations: [{ id: 'a', name: 'A', lat: 20, lng: 99, lines: ['line1'] },
  { id: 'b', name: 'B', lat: 20.01, lng: 99, lines: ['line1'] }],
  routes: [{ id: 'line1', geometry: { type: 'LineString', coordinates: [[99, 20], [99, 21]] } }] }
const snapshot = (sequence = 1, waiting = 1, extra = {}) => ({ schemaVersion: 1, streamId: 'first', sequence,
  catalogVersion: version, capturedAt: new Date(100000).toISOString(), stations: [crowd('a', waiting), crowd('b', 2)], ...extra })
const event = (sequence, waiting, extra = {}) => ({ ...snapshot(sequence, waiting), kind: 'delta', stations: [crowd('a', waiting)], ...extra })
function harness(load = async () => snapshot(1, 1, { catalog })) {
  let clock = 100000, tick, cancelled = false, errors = 0, requests = 0
  const catalogs = [], updates = [], queries = []
  const feed = startPublicDataFeed({
    loadSnapshot: (...args) => { requests++; queries.push(args.slice(0, 2)); return load(...args) },
    onCatalog: value => catalogs.push(value), onCrowds: value => updates.push(value),
    onError: () => errors++, now: () => clock, random: () => 0,
    schedule: cb => { tick = cb; return () => { cancelled = true } },
  })
  return { feed, catalogs, updates, queries, advance: ms => { clock += ms }, tick: () => tick(),
    requests: () => requests, errors: () => errors, cancelled: () => cancelled }
}

test('initial load sends catalog once; deltas update only the affected station without loading geometry', async () => {
  const h = harness(); await h.feed.refresh();
  h.feed.receive(event(2, 8)); h.feed.receive(event(2, 8)); h.feed.receive(event(1, 0));
  assert.equal(h.requests(), 1); assert.equal(h.catalogs.length, 1);
  assert.deepEqual(h.updates.at(-1), [crowd('a', 8)]); assert.equal(h.updates.length, 2);
  h.feed.stop();
});

test('an event racing initial HTTP is replayed after the catalog, and late HTTP cannot rewind counts', async () => {
  let resolve
  const h = harness(() => new Promise(r => { resolve = r }));
  const initial = h.feed.refresh(); h.feed.receive(event(2, 8));
  resolve(snapshot(1, 1, { catalog })); await initial;
  assert.equal(h.updates.at(-1)[0].waiting, 8);
  const pending = h.feed.refresh(); h.feed.receive(event(3, 9));
  resolve(snapshot(2, 8)); await pending;
  assert.equal(h.updates.at(-1)[0].waiting, 9); assert.equal(h.catalogs.length, 1);
  h.feed.stop();
});

test('a missing delta is repaired by HTTP, including when only a later heartbeat arrives', async () => {
  let current = snapshot(1, 1, { catalog });
  const h = harness(async () => current); await h.feed.refresh();
  current = snapshot(3, 12);
  h.feed.receive(event(3, 0, { kind: 'heartbeat', stations: [] })); await flush();
  assert.equal(h.updates.at(-1)[0].waiting, 12);
  assert.deepEqual(h.queries.at(-1), [version, routesVersion]);
  assert.equal(h.catalogs.length, 1);
  h.feed.stop();
});

test('healthy heartbeats suppress HTTP polling even when nobody is waiting or counts do not change', async () => {
  const h = harness(); await h.feed.refresh(); h.feed.connectionChanged(true); await flush();
  const baseline = h.requests();
  for (let i = 0; i < 12; i++) {
    h.advance(10000); h.feed.receive(event(1, 0, { kind: 'heartbeat', stations: [] })); h.tick(); await flush();
  }
  assert.equal(h.requests(), baseline);
  h.advance(26000); h.tick(); await flush(); assert.equal(h.requests(), baseline + 1);
  h.feed.stop();
});

test('missing Realtime uses compact HTTP fallback and failures back off until a reconnect recovers', async () => {
  let offline = false;
  const h = harness(async () => { if (offline) throw new Error('offline'); return snapshot(1, 1, { catalog }) });
  await h.feed.refresh();
  h.advance(15000); h.tick(); await flush(); assert.equal(h.requests(), 2);
  offline = true; h.advance(15000); h.tick(); await flush();
  h.advance(15000); h.tick(); await flush(); assert.equal(h.errors(), 2);
  h.advance(15000); h.tick(); await flush(); assert.equal(h.errors(), 2, 'second failure waits 30 seconds');
  offline = false; h.feed.connectionChanged(true); await flush(); assert.equal(h.requests(), 5);
  h.feed.stop();
});

test('station rename/add/delete reloads metadata with cached routes and rejects old-catalog deltas', async () => {
  let current = snapshot(1, 1, { catalog });
  const h = harness(async () => current); await h.feed.refresh();
  const nextVersion = 'c'.repeat(64);
  const nextCatalog = { ...catalog, version: nextVersion, routes: undefined, stations: [{ ...catalog.stations[0], name: 'Renamed' }] };
  current = snapshot(2, 8, { catalogVersion: nextVersion, catalog: nextCatalog, stations: [crowd('a', 8)] });
  h.feed.receive(event(2, 8, { catalogVersion: nextVersion })); await flush();
  assert.deepEqual(h.catalogs.at(-1).routes, catalog.routes); assert.equal(h.catalogs.at(-1).stations.length, 1);
  assert.equal(h.catalogs.at(-1).stations[0].name, 'Renamed');
  h.feed.receive(event(1, 0)); await flush();
  assert.equal(h.updates.at(-1)[0].waiting, 8);
  current = snapshot(3, 0, { catalogVersion: 'd'.repeat(64), stations: [],
    catalog: { ...nextCatalog, version: 'd'.repeat(64), stations: [] } });
  await h.feed.refresh(); assert.equal(h.catalogs.at(-1).stations.length, 0); assert.deepEqual(h.updates.at(-1), []);
  h.feed.stop();
});

test('new route geometry replaces the cache and missing geometry is rejected', async () => {
  let current = snapshot(1, 1, { catalog });
  const h = harness(async () => current); await h.feed.refresh();
  const nextCatalog = { ...catalog, version: 'c'.repeat(64), routesVersion: 'd'.repeat(64), routes: undefined };
  current = snapshot(2, 1, { catalogVersion: nextCatalog.version, catalog: nextCatalog });
  assert.equal(await h.feed.refresh(), false); assert.equal(h.catalogs.length, 1);
  current.catalog.routes = [];
  assert.equal(await h.feed.refresh(), true); assert.deepEqual(h.catalogs.at(-1).routes, []);
  h.feed.stop();
});

test('server restarts require a snapshot and delayed messages from the previous stream are ignored', async () => {
  let current = snapshot(9, 9, { catalog });
  const h = harness(async () => current); await h.feed.refresh();
  current = snapshot(1, 1, { streamId: 'second' });
  h.feed.receive(event(2, 7, { streamId: 'second' })); await flush();
  assert.equal(h.updates.at(-1)[0].waiting, 7);
  const count = h.requests(); h.feed.receive(event(20, 20)); await flush();
  assert.equal(h.requests(), count); assert.equal(h.updates.at(-1)[0].waiting, 7);
  h.feed.stop();
});

test('malformed events never modify the UI; stopped feeds ignore in-flight snapshots', async () => {
  let resolve
  const h = harness(() => new Promise(r => { resolve = r }));
  const pending = h.feed.refresh();
  for (const invalid of [{}, event(2, -1), event(2, 1, { stations: null }), event(2, 1, { kind: 'unknown' }),
    event(2, 1, { stations: [crowd('a', 1), crowd('a', 2)] })]) h.feed.receive(invalid);
  h.feed.stop(); resolve(snapshot(1, 1, { catalog })); await pending;
  assert.equal(h.updates.length, 0); assert.equal(h.catalogs.length, 0); assert.equal(h.cancelled(), true);
});
