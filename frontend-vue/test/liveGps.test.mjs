import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalUnavailableReason, canEstimateArrival, lastKnownPosition, interpolatePosition, holdStoppedPosition } from '../src/liveGps.ts';

const now = Date.parse('2026-09-15T14:00:00Z');
const bus = { connectionStatus: 'fresh', feedHealthy: true, status: 'RUNNING', speedKph: 20,
  lastGpsAt: new Date(now).toISOString(), lat: 20.05, lng: 99.89 };

test('arrival explains unassigned fleet and unknown speed without inventing an ETA', () => {
  assert.equal(arrivalUnavailableReason([{ ...bus, line: null, speedKph: null }], ['line1'], now), 'speedMissing');
  assert.equal(arrivalUnavailableReason([{ ...bus, line: 'line1', speedKph: null }], ['line1'], now), 'speedMissing');
  assert.equal(arrivalUnavailableReason([{ ...bus, line: '1' }], ['line1'], now), 'headingMissing');
  assert.equal(arrivalUnavailableReason([{ ...bus, line: 'line1', directionRaw: 90 }], ['line1'], now), 'noApproachingBus');
});

test('arrival distinguishes missing route, expired GPS and a stopped bus', () => {
  const assigned = { ...bus, line: 'line1' };
  assert.equal(arrivalUnavailableReason([assigned], [], now), 'routeMissing');
  assert.equal(arrivalUnavailableReason([assigned], ['line1'], now + 30001), 'gpsMissing');
  assert.equal(arrivalUnavailableReason([{ ...assigned, feedHealthy: false }], ['line1'], now), 'gpsMissing');
  assert.equal(arrivalUnavailableReason([{ ...assigned, status: 'STOPPED', speedKph: 0 }], ['line1'], now), 'stopped');
  // An unrelated line must not make a station report that its bus is stopped.
  assert.equal(arrivalUnavailableReason([{ ...assigned, line: 'line2', status: 'STOPPED' }], ['line1'], now), 'gpsMissing');
});

test('stopped GPS jitter stays anchored while departure, arrival and large corrections are accepted', () => {
  const stopped = { ...bus, status: 'STOPPED', speedKph: 0 };
  for (const distance of [0, 3, 8, 15]) assert.equal(holdStoppedPosition('STOPPED', stopped, distance), true);
  assert.equal(holdStoppedPosition('STOPPED', stopped, 16), false);
  assert.equal(holdStoppedPosition('RUNNING', stopped, 3), false);
  assert.equal(holdStoppedPosition('STOPPED', bus, 3), false);
  assert.equal(holdStoppedPosition('STOPPED', { ...bus, status: 'UNKNOWN' }, 3), false);
});

test('ETA expires after 30 seconds even if polling stops and cached status still says fresh', () => {
  assert.equal(canEstimateArrival(bus, now + 30000), true);
  assert.equal(canEstimateArrival(bus, now + 30001), false);
  assert.deepEqual(lastKnownPosition(bus, now + 30001), { lat: bus.lat, lng: bus.lng });
  assert.equal(lastKnownPosition(bus, now + 300001), null);
});

test('parked, unknown-speed, invalid-clock and disconnected vehicles cannot supply an ETA', () => {
  for (const change of [{ status: 'STOPPED' }, { speedKph: 0 }, { speedKph: null }, { speedKph: NaN },
    { feedHealthy: false }, { connectionStatus: 'unknown' }, { lastGpsAt: null },
    { lastGpsAt: new Date(now + 1000).toISOString() }]) {
    assert.equal(canEstimateArrival({ ...bus, ...change }, now), false);
  }
});

test('interpolation stays between measured positions and finishes at the new fix', () => {
  const from = { lat: 20, lng: 99 }, to = { lat: 21, lng: 100 };
  assert.deepEqual(interpolatePosition(from, to, -1), from);
  assert.deepEqual(interpolatePosition(from, to, 0.5), { lat: 20.5, lng: 99.5 });
  assert.deepEqual(interpolatePosition(from, to, 2), to);
});
