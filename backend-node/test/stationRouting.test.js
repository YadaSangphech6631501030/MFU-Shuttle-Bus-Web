const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRouteBearings } = require('../services/stationRouting');

test('optional stop headings support arbitrary assigned lines and can be cleared', () => {
  assert.deepEqual(normalizeRouteBearings({ new_line: 0, line3: 359.9 }, ['new_line', 'line3']),
    { routeBearings: { new_line: 0, line3: 359.9 } });
  assert.deepEqual(normalizeRouteBearings(null, ['line1']), { routeBearings: {} });
});

test('invalid headings or route keys cannot enter station routing data', () => {
  for (const value of [[], 'north', 0, { line1: '90' }, { line1: NaN }, { line1: Infinity },
    { line1: -1 }, { line1: 360 }, { unknown: 90 }, { '$line': 90 }, { 'line.1': 90 },
    JSON.parse('{"__proto__":90}'), { all: 90 }]) {
    assert.ok(normalizeRouteBearings(value, ['line1']).error, JSON.stringify(value));
  }
});
