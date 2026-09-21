const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPublicData } = require('../services/public-data');

const row = (id, waiting) => ({ id, waiting, status: 'LOW', statusColor: '#123456', statusLabel: '' });
function harness() {
  let clock = 100000, catalogReads = 0, crowdReads = 0;
  const data = { routes: [{ id: 'line1', geometry: { coordinates: [[99, 20], [99, 21]] } }],
    stations: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] };
  let crowds = [row('a', 1), row('b', 2)];
  const events = [];
  const service = createPublicData({ now: () => clock,
    loadCatalog: async () => { catalogReads++; return structuredClone(data); },
    loadCrowds: async () => { crowdReads++; return structuredClone(crowds); },
    publish: async event => { events.push(event); },
  });
  return { service, data, events, advance: ms => { clock += ms; }, counts: () => [catalogReads, crowdReads],
    setCrowds: value => { crowds = value; } };
}

test('1000 simultaneous clients share a catalog and crowd read; count updates omit all geometry', async () => {
  const h = harness();
  const clients = await Promise.all(Array.from({ length: 1000 }, () => h.service.get()));
  assert.deepEqual(h.counts(), [1, 1]);
  assert.ok(clients.every(value => value.sequence === clients[0].sequence));
  const first = clients[0];
  h.advance(1001); h.setCrowds([row('a', 8), row('b', 2)]);
  const next = await h.service.get(first.catalogVersion, first.catalog.routesVersion);
  assert.equal(next.catalog, undefined);
  assert.equal(next.catalogVersion, first.catalogVersion);
  assert.equal(next.sequence, first.sequence + 1);
  assert.deepEqual(h.events.at(-1).stations, [row('a', 8)]);
  assert.equal(JSON.stringify(h.events.at(-1)).includes('geometry'), false);
  assert.deepEqual(h.counts(), [1, 2]);
});

test('unchanged data sends only a periodic heartbeat and never advances the sequence', async () => {
  const h = harness(); const first = await h.service.get();
  for (let i = 0; i < 9; i++) { h.advance(1000); await h.service.refresh(); }
  assert.equal(h.events.length, 1);
  h.advance(1000); await h.service.refresh();
  assert.equal(h.events.length, 2);
  assert.equal(h.events[1].kind, 'heartbeat');
  assert.deepEqual(h.events[1].stations, []);
  assert.equal(h.events[1].sequence, first.sequence);
});

test('station edits, insertions and deletions refresh metadata without retransmitting routes', async () => {
  const h = harness(); const first = await h.service.get();
  h.data.stations = [{ id: 'a', name: 'Renamed' }, { id: 'new', name: 'New stop' }];
  h.setCrowds([row('a', 3), row('new', 0)]); h.service.invalidate();
  const next = await h.service.get(first.catalogVersion, first.catalog.routesVersion);
  assert.notEqual(next.catalogVersion, first.catalogVersion);
  assert.equal(next.catalog.routes, undefined);
  assert.equal(next.catalog.routesVersion, first.catalog.routesVersion);
  assert.deepEqual(next.catalog.stations, h.data.stations);
  assert.deepEqual(next.stations.map(station => station.id), ['a', 'new']);
  h.data.stations = []; h.setCrowds([]); h.service.invalidate();
  const empty = await h.service.get(next.catalogVersion, next.catalog.routesVersion);
  assert.deepEqual(empty.catalog.stations, []);
  assert.deepEqual(empty.stations, []);
});

test('route changes and disabling all routes return the new geometry exactly once per version', async () => {
  const h = harness(); const first = await h.service.get();
  h.data.routes[0].geometry.coordinates[1] = [100, 21]; h.service.invalidate();
  const changed = await h.service.get(first.catalogVersion, first.catalog.routesVersion);
  assert.notEqual(changed.catalog.routesVersion, first.catalog.routesVersion);
  assert.deepEqual(changed.catalog.routes, h.data.routes);
  assert.equal((await h.service.get(changed.catalogVersion, changed.catalog.routesVersion)).catalog, undefined);
  h.data.routes = []; h.data.stations = []; h.service.invalidate();
  assert.deepEqual((await h.service.get(changed.catalogVersion, changed.catalog.routesVersion)).catalog.routes, []);
});

test('threshold color and label changes broadcast even when the count stays the same', async () => {
  const h = harness(); const first = await h.service.get();
  h.setCrowds([{ ...row('a', 1), status: 'custom_full', statusColor: '#abcdef', statusLabel: 'Full' }, row('b', 2)]);
  h.advance(1001);
  const next = await h.service.get(first.catalogVersion);
  assert.equal(next.catalog, undefined);
  assert.equal(h.events.at(-1).stations[0].statusLabel, 'Full');
});

test('out-of-band catalog edits are detected by the shared bounded refresh', async () => {
  const h = harness(); const first = await h.service.get();
  h.data.stations[0].name = 'External edit'; h.advance(60001);
  const next = await h.service.get(first.catalogVersion, first.catalog.routesVersion);
  assert.equal(next.catalog.stations[0].name, 'External edit');
});

test('a write during an in-flight read cannot leave a stale catalog cached', async () => {
  let release, calls = 0;
  const service = createPublicData({
    loadCatalog: () => ++calls === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ routes: [], stations: [] }),
    loadCrowds: async () => [],
  });
  const pending = service.get();
  service.invalidate(); release({ routes: [{ id: 'deleted' }], stations: [] });
  assert.deepEqual((await pending).catalog.routes, []);
  assert.equal(calls, 2);
});

test('slow or failed publishing never blocks HTTP snapshots or rolls back stored data', async () => {
  let count = 1;
  const service = createPublicData({ loadCatalog: async () => ({ routes: [], stations: [{ id: 'a' }] }),
    loadCrowds: async () => [row('a', count)], publish: async () => { throw new Error('offline'); } });
  const first = await service.get(); count = 4; await service.refresh();
  assert.equal((await service.get(first.catalogVersion)).stations[0].waiting, 4);
});

test('HTTP during a metadata reload cannot combine the new catalog with old counts', async () => {
  let changed = false, release, reads = 0;
  const service = createPublicData({ now: () => 100000,
    loadCatalog: async () => ({ routes: [], stations: [{ id: changed ? 'new' : 'old' }] }),
    loadCrowds: async () => ++reads === 1 ? [row('old', 1)] : new Promise(resolve => { release = resolve; }),
  });
  const first = await service.get();
  changed = true; service.invalidate();
  const refreshing = service.refresh();
  await new Promise(resolve => setImmediate(resolve));
  let received = false;
  const request = service.get(first.catalogVersion).then(value => { received = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(received, false, 'must await matching crowd data');
  release([row('new', 2)]); await refreshing;
  const result = await request;
  assert.equal(result.catalog.version, result.catalogVersion);
  assert.equal(result.catalog.stations[0].id, result.stations[0].id);
});
