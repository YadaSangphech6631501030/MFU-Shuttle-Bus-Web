import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRouteArrival } from '../src/arrival.ts';
import { createGpsMotionEstimator } from '../src/gpsMotion.ts';
import { tripTimeText } from '../src/arrivalDisplay.ts';

const now = Date.parse('2026-09-16T01:00:00Z');
const point = lng => ({ lat: 20, lng });
const station = point(99.005);
const path = [point(99), station, point(99.01)];
const bus = { ...point(99), busId: 'MFU01', line: null, speedKph: 20, directionRaw: 90,
  status: 'RUNNING', connectionStatus: 'fresh', feedHealthy: true, lastGpsAt: new Date(now).toISOString() };
const eta = buses => estimateRouteArrival(station, 'line1', path, buses, now);

test('closed route includes the next lap instead of dropping a bus past the stop', () => {
  const loop = [...path, { lat: 20.01, lng: 99.01 }, { lat: 20.01, lng: 99 }, point(99)];
  const passed = { ...bus, lng: 99.006 };
  assert.equal(eta([passed]), null, 'open route cannot wrap');
  const nextLap = estimateRouteArrival(station, 'line1', loop, [passed], now);
  assert.ok(nextLap >= 12 && nextLap <= 14, `next lap must include the whole loop: ${nextLap}`);
  assert.equal(estimateRouteArrival(station, 'line1', loop, [passed, bus], now), 2);
  assert.ok(estimateRouteArrival(station, 'line1', loop, [{ ...bus, directionRaw: 270 }], now) > 2);
});

test('summary explains missing ETA and calculates total once arrival becomes available', () => {
  assert.deepEqual(tripTimeText(null, 1, 'speedMissing', 'en'), {
    arrival: 'Awaiting speed data', total: 'Awaiting bus ETA',
  });
  assert.deepEqual(tripTimeText(null, 1, 'gpsMissing', 'th'), {
    arrival: 'รอ GPS ล่าสุด', total: 'รอเวลารถมาถึง',
  });
  assert.deepEqual(tripTimeText(3, 1, 'speedMissing', 'en'), { arrival: '3 min', total: '4 min' });
  assert.deepEqual(tripTimeText(0, 1, 'stopped', 'th'), { arrival: '0 นาที', total: '1 นาที' });
});

test('unassigned GPS bus contributes an ETA; fastest arrival wins over closest distance', () => {
  assert.equal(eta([bus]), 2);
  const nearer = { ...bus, lng: 99.004, speedKph: 2 };
  assert.equal(eta([nearer]), 4);
  assert.equal(eta([nearer, bus]), 2);
  assert.equal(eta([{ ...bus, line: 'line2' }]), null);
  assert.equal(eta([{ ...bus, line: '1' }]), 2);
});

test('rejects buses driving away, across the route, off-route or with old GPS', () => {
  for (const changes of [{ directionRaw: 270 }, { directionRaw: 0 }, { lng: 99.006 },
    { lat: 20.01 }, { lastGpsAt: new Date(now - 31000).toISOString() },
    { feedHealthy: false }, { directionRaw: null }, { speedKph: null }]) {
    assert.equal(eta([{ ...bus, ...changes }]), null, JSON.stringify(changes));
  }
  assert.equal(eta([{ ...bus, lng: 99.009, directionRaw: 270 }]), 2);
});

test('fresh stopped vehicle at the stop has arrived; parked or stale distant vehicles do not supply ETA', () => {
  assert.equal(eta([{ ...bus, ...station, status: 'STOPPED', speedKph: 0, directionRaw: null }]), 0);
  assert.equal(eta([{ ...bus, status: 'STOPPED', speedKph: 0 }]), null);
  assert.equal(eta([{ ...bus, ...station, status: 'STOPPED', lastGpsAt: new Date(now - 31000).toISOString() }]), null);
});

test('two GPS fixes supply missing speed and heading, including an unassigned bus ETA', () => {
  const estimate = createGpsMotionEstimator();
  const first = { ...bus, speedKph: null, directionRaw: null };
  assert.equal(estimate([first], now)[0].speedKph, null);
  const second = { ...first, lng: 99.0005, lastGpsAt: new Date(now + 10000).toISOString() };
  const measured = estimate([second], now + 10000)[0];
  assert.ok(measured.speedKph > 18 && measured.speedKph < 20);
  assert.ok(Math.abs(measured.directionRaw - 90) < .1);
  assert.equal(estimateRouteArrival(station, 'line1', path, [measured], now + 10000), 2);
  assert.equal(estimate([second], now + 15000)[0].speedKph, measured.speedKph);
  assert.equal(second.speedKph, null, 'does not mutate the provider response');
});

test('motion estimation rejects unchanged positions, jumps, long gaps, and stopped buses', () => {
  for (const [changes, elapsed] of [[{}, 10000], [{ lng: 99.000001 }, 10000],
    [{ lng: 99.1 }, 10000], [{ lng: 99.0005 }, 31000],
    [{ lng: 99.0005, status: 'STOPPED' }, 10000]]) {
    const estimate = createGpsMotionEstimator();
    const first = { ...bus, speedKph: null, directionRaw: null };
    estimate([first], now);
    assert.equal(estimate([{ ...first, ...changes, lastGpsAt: new Date(now + elapsed).toISOString() }], now + elapsed)[0].speedKph, null);
  }
});

test('measured provider speed wins and samples never cross vehicle IDs or disconnects', () => {
  const estimate = createGpsMotionEstimator();
  estimate([{ ...bus, speedKph: null }], now);
  const second = { ...bus, lng: 99.0005, lastGpsAt: new Date(now + 10000).toISOString() };
  assert.equal(estimate([{ ...second, speedKph: 0 }], now + 10000)[0].speedKph, 0);
  assert.equal(estimate([{ ...second, busId: 'MFU02', speedKph: null }], now + 10000)[0].speedKph, null);
  estimate([{ ...second, feedHealthy: false }], now + 10000);
  assert.equal(estimate([{ ...second, speedKph: null }], now + 10000)[0].speedKph, null);
});
