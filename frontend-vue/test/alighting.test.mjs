import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutePlanner, findAlightingStop, findRide, distanceMeters, pathDistanceMeters } from '../src/routePlanning.ts';

const stop = (id, lng, lat = 0, lines = ['line1']) => ({ id, lat, lng, lines });
const from = stop('origin', 0);
const to = stop('destination', .02, .0001);
const opposite = stop('opposite', .02);
const nearOrigin = stop('nearOrigin', .0001);
const paths = new Map([['line1', [from, nearOrigin, opposite, stop('turn', .04), to]]]);

test('alighting is near the destination, with the original boarding stop and no bus path for the walk', () => {
  const result = findAlightingStop(from, to, [nearOrigin, opposite], paths);
  assert.equal(result.stationId, 'opposite');
  assert.deepEqual(result.path[0], { lat: from.lat, lng: from.lng });
  assert.deepEqual(result.path.at(-1), { lat: opposite.lat, lng: opposite.lng });
  assert.equal(result.distanceMeters, distanceMeters(opposite, to));
  assert.ok(result.distanceMeters < 12);
  assert.equal(findAlightingStop(from, to, [nearOrigin], paths), null);
});

test('recommends getting off before a long detour even when a direct ride exists', () => {
  const direct = findRide(from, to, paths);
  const result = findAlightingStop(from, to, [opposite], paths);
  assert.ok(direct);
  assert.ok(result);
  assert.ok(pathDistanceMeters(direct.path) > pathDistanceMeters(result.path) * 2);
});

test('keeps a short direct ride and avoids a marginal saving that adds walking', () => {
  const short = new Map([['line1', [from, opposite, to]]]);
  assert.equal(findAlightingStop(from, to, [opposite], short), null);
  assert.equal(findAlightingStop(from, from, [opposite], paths), null);
});

test('destination need not be served, but the alighting stop must be reachable on the selected line', () => {
  assert.equal(findAlightingStop(from, { ...to, lines: ['line2'] }, [opposite], paths).stationId, 'opposite');
  assert.equal(findAlightingStop(from, to, [{ ...opposite, lines: ['line2'] }], paths), null);
});

test('adding and removing an alighting stop updates the recommendation without a fixed station list', () => {
  const unavailable = { ...to, lines: ['line2'] };
  assert.equal(createRoutePlanner([from, unavailable], paths).alighting(from.id, to.id), null);
  const planner = createRoutePlanner([from, unavailable, opposite], paths);
  assert.equal(planner.alighting(from.id, to.id).stationId, opposite.id);
  assert.equal(createRoutePlanner([from, unavailable], paths).alighting(from.id, to.id), null);
});

test('compares actual route lengths across lines and walking cost across nearby stops', () => {
  const fromBoth = { ...from, lines: ['line1', 'line2'] };
  const oppositeBoth = { ...opposite, lines: ['line1', 'line2'] };
  const fasterPaths = new Map([
    ['line1', [from, stop('detour', .01, .02), opposite]],
    ['line2', [from, opposite]],
  ]);
  assert.equal(findRide(fromBoth, oppositeBoth, fasterPaths).line, 'line2');
  const result = findAlightingStop(fromBoth, to, [oppositeBoth], fasterPaths);
  assert.equal(result.line, 'line2');
  const farther = stop('farther', .017);
  const nearestAfterDetour = stop('nearest', .02, .00009);
  const detourPath = new Map([['line1', [from, farther, opposite, stop('turn', .04), nearestAfterDetour]]]);
  assert.equal(findAlightingStop(from, to, [farther, opposite, nearestAfterDetour], detourPath).stationId, 'opposite');
});

test('rejects invalid geometry, coordinates and stops over 500 m from the destination', () => {
  for (const invalid of [{ ...opposite, lat: NaN }, stop('far', .01)]) {
    assert.equal(findAlightingStop(from, to, [invalid], paths), null);
  }
  assert.equal(findAlightingStop(from, { ...to, lng: Infinity }, [opposite], paths), null);
  assert.equal(findAlightingStop({ ...from, lat: NaN }, to, [opposite], paths), null);
  assert.equal(findAlightingStop(from, to, [opposite], new Map()), null);
  assert.equal(findAlightingStop(from, to, [opposite], new Map([['line1', [from, { lat: NaN, lng: 0 }, opposite]]])), null);
});
