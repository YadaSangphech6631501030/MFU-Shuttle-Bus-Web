const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCrowdThresholds, crowdLevel, getCrowdThresholds, saveCrowdThresholds } = require('../services/settings');

test('independent ranges retain gaps, overlaps, zero and unlimited ends', () => {
  const ranges = normalizeCrowdThresholds({ low: { min: 2, max: 5 }, medium: { min: 8, max: 12 }, high: { min: 10, max: null } });
  for (const [count, expected] of [[0, 'UNKNOWN'], [2, 'LOW'], [5, 'LOW'], [6, 'UNKNOWN'], [8, 'MEDIUM'], [10, 'HIGH'], [9999, 'HIGH']]) {
    assert.equal(crowdLevel(count, ranges), expected);
  }
  assert.equal(crowdLevel(0, normalizeCrowdThresholds({ low: { min: 0, max: 0 }, medium: { min: 1, max: 2 }, high: { min: 3, max: 4 } })), 'LOW');
  for (const range of [{ min: -1, max: 4 }, { min: 5, max: 4 }, { min: 1.2, max: null }, { min: '', max: 4 }]) {
    assert.throws(() => normalizeCrowdThresholds({ ...ranges, low: range }));
  }
});

test('saved ranges survive reload and legacy thresholds migrate without changing boundaries', async () => {
  let document = { medium: 6, high: 10 };
  const db = { collection: () => ({ findOne: async () => document, updateOne: async (_, update) => { document = update.$set; } }) };
  assert.deepEqual(await getCrowdThresholds(db), normalizeCrowdThresholds({ low: { min: 0, max: 5 }, medium: { min: 6, max: 9 }, high: { min: 10, max: null } }));
  const ranges = { low: { min: 1, max: 3 }, medium: { min: 7, max: 11 }, high: { min: 15, max: 40 } };
  await saveCrowdThresholds(db, ranges);
  assert.deepEqual(await getCrowdThresholds(db), normalizeCrowdThresholds(ranges));
  assert.equal(crowdLevel(41, await getCrowdThresholds(db)), 'UNKNOWN');
});

test('custom colors persist with ranges; old settings get defaults and invalid colors are rejected', async () => {
  let document;
  const db = { collection: () => ({ findOne: async () => document, updateOne: async (_, update) => { document = update.$set; } }) };
  const ranges = await getCrowdThresholds(db);
  assert.equal(ranges.colors.low, '#2eb85c');
  ranges.colors = { low: '#112233', medium: '#ABCDEF', high: '#FFFFFF' };
  await saveCrowdThresholds(db, ranges);
  assert.deepEqual((await getCrowdThresholds(db)).colors, { low: '#112233', medium: '#abcdef', high: '#ffffff' });
  for (const color of ['red', '#fff', '', '#123456;display:none', 123]) {
    await assert.rejects(saveCrowdThresholds(db, { ...ranges, colors: { ...ranges.colors, high: color } }));
  }
  assert.equal((await getCrowdThresholds(db)).colors.high, '#ffffff');
});

test('saving rejects overlapping, reversed and unbounded lower ranges without changing stored settings', async () => {
  let document;
  let writes = 0;
  const db = { collection: () => ({ findOne: async () => document, updateOne: async (_, update) => { writes++; document = update.$set; } }) };
  const valid = { low: { min: 0, max: 5 }, medium: { min: 6, max: 9 }, high: { min: 10, max: null } };
  await saveCrowdThresholds(db, valid);
  const saved = await getCrowdThresholds(db);
  for (const change of [
    { medium: { min: 5, max: 9 } },
    { high: { min: 9, max: 15 } },
    { low: { min: 10, max: 20 } },
    { low: { min: 0, max: null } },
    { medium: { min: 6, max: null } },
    { medium: { min: 8, max: 7 } },
  ]) {
    await assert.rejects(saveCrowdThresholds(db, { ...valid, ...change }));
    assert.deepEqual(await getCrowdThresholds(db), saved);
  }
  assert.equal(writes, 1);
  await saveCrowdThresholds(db, { ...valid, high: { min: 10, max: 10 } });
  assert.equal(crowdLevel(10, await getCrowdThresholds(db)), 'HIGH');
});
