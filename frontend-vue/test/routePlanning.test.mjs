import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutePlanner, findRide, distanceMeters, pathDistanceMeters } from '../src/routePlanning.ts';
import { buildRouteGeometry, locateStopOnRoute } from '../src/routeGeometry.ts';

const point = (lng, lat = 0) => ({ lng, lat });
const stop = (id, lng, lat = 0, lines = ['new-campus-line']) => ({ id, ...point(lng, lat), lines });
const pathsFor = path => new Map([['new-campus-line', path]]);
const open = [point(0), point(.02)];
const square = [point(0), point(.01), point(.01, .01), point(0, .01), point(0)];
const overlap = [point(0), point(.01), point(.02), point(.01), point(0)];

test('new station IDs work between vertices, independent of station array order', () => {
  const a = stop('random-uuid', .001);
  const b = stop('station23', .002);
  const planner = createRoutePlanner([b, a], pathsFor(open));
  assert.ok(planner.ride(a.id, b.id));
  assert.ok(Math.abs(pathDistanceMeters(planner.ride(a.id, b.id).path) - 111.19) < 1);
  assert.equal(planner.ride(b.id, a.id), null);
});

test('closed drawings end the passenger run instead of carrying riders into another lap', () => {
  const a = stop('last-edge', 0, .005);
  const b = stop('first-edge', .005);
  assert.equal(findRide(a, b, pathsFor(square)), null);
  assert.ok(findRide(b, a, pathsFor(square)).path.some(p => p.lat === .01));
  assert.equal(findRide(a, a, pathsFor(square)), null);
});

test('the identical first/last coordinate is the departure and cannot be reached by crossing the run boundary', () => {
  const route = buildRouteGeometry(square);
  assert.equal(locateStopOnRoute(point(0), route).distanceFromStart, 0);
  assert.ok(findRide(stop('seam', 0), stop('next', .005), pathsFor(square)));
  assert.equal(findRide(stop('next', .005), stop('seam', 0), pathsFor(square)), null);
});

test('near-closed endpoints do not authorize a new passenger lap either', () => {
  const nearlyClosed = [...square.slice(0, -1), point(0, .00001)];
  assert.equal(buildRouteGeometry(nearlyClosed).closed, true);
  const first = stop('first', .005), last = stop('last', 0, .005);
  assert.ok(findRide(first, last, pathsFor(nearlyClosed)));
  assert.equal(findRide(last, first, pathsFor(nearlyClosed)), null);
});

test('left-hand roadside positions distinguish outbound and inbound shared segments', () => {
  const route = buildRouteGeometry(overlap);
  const outward = stop('out', .012, .00003);
  const inward = stop('back', .012, -.00003);
  const a = locateStopOnRoute(outward, route);
  const b = locateStopOnRoute(inward, route);
  assert.ok(a.distanceFromStart < b.distanceFromStart);
  assert.equal(Math.round(a.bearing), 90);
  assert.equal(Math.round(b.bearing), 270);
  const ride = findRide(outward, inward, pathsFor(overlap));
  assert.ok(ride.path.some(p => p.lng === .02));
  assert.ok(pathDistanceMeters(ride.path) > 1700);
});

test('exactly overlapping centre-line stops require a bearing instead of guessing', () => {
  const route = buildRouteGeometry(overlap);
  const center = point(.012);
  assert.equal(locateStopOnRoute(center, route), null);
  assert.ok(locateStopOnRoute(center, route, 90).distanceFromStart < locateStopOnRoute(center, route, 270).distanceFromStart);
  for (const invalid of [NaN, Infinity, -1, 360]) assert.equal(locateStopOnRoute(center, route, invalid), null);
  const from = { ...stop('center', .012), routeBearings: { 'new-campus-line': 90 } };
  const to = { ...stop('next', .015), routeBearings: { 'new-campus-line': 90 } };
  assert.ok(findRide(from, to, pathsFor(overlap)));
  assert.equal(findRide({ ...from, routeBearings: undefined }, to, pathsFor(overlap)), null);
});

test('sparse retraced segments remain separate visits even when their indices are adjacent', () => {
  const route = buildRouteGeometry([point(0), point(.02), point(0)]);
  assert.equal(locateStopOnRoute(point(.005), route), null);
  assert.equal(Math.round(locateStopOnRoute(point(.005, .00003), route).bearing), 90);
  assert.equal(Math.round(locateStopOnRoute(point(.005, -.00003), route).bearing), 270);
});

test('adding, deleting, moving, renaming and reassigning stops takes effect on rebuild', () => {
  const a = stop('a', .001), b = stop('b', .005), added = stop('future-stop-9000', .009);
  const paths = pathsFor(open);
  assert.equal(createRoutePlanner([a, b], paths).ride('a', added.id), null);
  assert.ok(createRoutePlanner([added, b, a], paths).ride('a', added.id));
  assert.equal(createRoutePlanner([a, added], paths).ride('a', 'b'), null);
  assert.equal(createRoutePlanner([a, { ...added, lat: .01 }], paths).ride('a', added.id), null);
  assert.equal(createRoutePlanner([a, { ...added, lines: ['other-line'] }], paths).ride('a', added.id), null);
  assert.ok(createRoutePlanner([a, { ...added, id: 'another-name' }], paths).ride('a', 'another-name'));
  assert.equal(createRoutePlanner([], paths).ride('a', 'b'), null);
});

test('polyline edits, reversed direction and removed lines are reflected without stale positions', () => {
  const a = stop('a', .001), b = stop('b', .009);
  assert.ok(findRide(a, b, pathsFor(open)));
  assert.equal(findRide(a, b, pathsFor([...open].reverse())), null);
  assert.equal(findRide(a, b, pathsFor(open.map(p => ({ ...p, lat: .01 })))), null);
  assert.equal(findRide(a, b, new Map()), null);
});

test('nearest segment projection is stable when polyline sampling density changes', () => {
  const a = stop('a', .004, .00001), b = stop('b', .016, .00001);
  const dense = Array.from({ length: 21 }, (_, i) => point(i / 1000));
  assert.ok(Math.abs(pathDistanceMeters(findRide(a, b, pathsFor(open)).path)
    - pathDistanceMeters(findRide(a, b, pathsFor(dense)).path)) < .01);
});

test('invalid coordinates, remote stops and missing or degenerate geometry produce no ride', () => {
  const a = stop('a', .001), b = stop('b', .009);
  for (const path of [[], [point(0)], [point(0), point(0)], [point(0), point(NaN)]]) {
    assert.equal(findRide(a, b, pathsFor(path)), null);
  }
  assert.equal(findRide({ ...a, lat: NaN }, b, pathsFor(open)), null);
  assert.equal(findRide(a, { ...b, lat: .001 }, pathsFor(open)), null);
  assert.equal(distanceMeters(point(0), point(0)), 0);
  assert.ok(Number.isFinite(distanceMeters(point(0), point(180))));
});
