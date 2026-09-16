const test = require('node:test');
const assert = require('node:assert/strict');
const { createBusSnapshots } = require('../services/bus-snapshots');

test('concurrent clients share one read and cached snapshots expire', async () => {
  let reads = 0;
  let now = 10000;
  const cache = createBusSnapshots({ now: () => now, streamId: 'server-a', loadBuses: async () => {
    reads++;
    return [{ busId: 'MFU01', lat: 20, lng: 99 }];
  } });
  const snapshots = await Promise.all(Array.from({ length: 100 }, () => cache.get()));
  assert.equal(reads, 1);
  assert.ok(snapshots.every(s => s === snapshots[0]));
  now += 4999;
  assert.equal((await cache.get()).sequence, 1);
  now++;
  assert.equal((await cache.get()).sequence, 2);
  assert.equal(reads, 2);
  assert.equal((await cache.refresh()).sequence, 3);
});

test('a failed read does not poison future requests', async () => {
  let fail = true;
  const cache = createBusSnapshots({ loadBuses: async () => {
    if (fail) throw new Error('db offline');
    return [];
  } });
  await assert.rejects(cache.get());
  fail = false;
  assert.equal((await cache.get()).sequence, 1);
});
