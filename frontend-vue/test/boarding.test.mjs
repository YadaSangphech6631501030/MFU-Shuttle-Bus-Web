import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoutePlanner, distanceMeters, pathDistanceMeters, MAX_NEARBY_METERS, BUS_SPEED_METERS_PER_SECOND } from '../src/routePlanning.ts';
import { buildRouteGeometry, locateStopOnRoute } from '../src/routeGeometry.ts';

const readJson = relative => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
const stops = readJson('../../docker/mongo-init/backup/shuttlebus_system.stations.json')
  .map(stop => stop.id === 'station01' ? { ...stop, lines: ['line1', 'line2'] } : stop);
const defaults = readJson('../../backend-node/seed/route_defaults.json');
const point = stop => ({ lat: stop.lat, lng: stop.lng });

for (const source of ['asset', 'API default']) {
  const paths = new Map(['line2', 'line1'].map(line => {
    const geometry = source === 'asset'
      ? readJson(`../assets/routes/polyline_${line}_mfu.geojson`).features[0].geometry
      : defaults.find(route => route.id === line).geometry;
    return [line, geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))];
  }));
  const planner = createRoutePlanner(stops, paths);

  test(`${source}: Minimart to Lamduan 7 outbound walks to Lamduan 2 and boards line 1`, () => {
    const trip = planner.boarding('station21', 'station02', 'line1');
    assert.equal(trip.stationId, 'station01');
    assert.equal(trip.line, 'line1');
    assert.equal(Math.round(trip.distanceMeters), 120);
    assert.equal(trip.alighting, null);
    assert.deepEqual(trip.path[0], point(stops.find(stop => stop.id === 'station01')));
    assert.deepEqual(trip.path.at(-1), point(stops.find(stop => stop.id === 'station02')));
    assert.ok(pathDistanceMeters(trip.path) < 300, 'do not ride from Minimart across the terminus');
    assert.deepEqual(planner.plan('station21', 'station02', 'line1'), { ride: null, alighting: null });
  });

  test(`${source}: boarding and alighting recommendations work together with two separate walking distances`, () => {
    const trip = planner.boarding('station21', 'station14', 'line1');
    assert.equal(trip.stationId, 'station01');
    assert.equal(Math.round(trip.distanceMeters), 120);
    assert.equal(trip.alighting.stationId, 'station09');
    assert.equal(Math.round(trip.alighting.distanceMeters), 21);
    assert.equal(trip.line, 'line1');
    assert.equal(trip.alighting.line, trip.line);
    assert.deepEqual(trip.path, trip.alighting.path);
    assert.deepEqual(trip.path.at(-1), point(stops.find(stop => stop.id === 'station09')));
  });

  test(`${source}: hospital trips and explicit line selection use the appropriate line`, () => {
    const hospital = planner.boarding('station21', 'station22', 'line1');
    assert.equal(hospital.stationId, 'station01');
    assert.equal(hospital.line, 'line2');
    assert.equal(hospital.alighting, null);
    const explicit = createRoutePlanner(stops, new Map([['line2', paths.get('line2')]]));
    assert.equal(explicit.boarding('station21', 'station02').line, 'line2');
    assert.equal(explicit.boarding('station21', 'station02', 'line1').line, 'line2');
  });

  test(`${source}: existing direct rides and alighting advice keep the selected boarding stop`, () => {
    for (const [from, to] of [['station01', 'station02'], ['station01', 'station13'], ['station22', 'station01'], ['station07', 'station02']]) {
      const before = planner.plan(from, to, 'line1');
      assert.ok(before.ride || before.alighting);
      assert.equal(planner.boarding(from, to, 'line1'), null);
      assert.deepEqual(planner.plan(from, to, 'line1'), before);
    }
    assert.equal(planner.boarding('station21', 'station01', 'line1'), null, 'a 120 m destination must not generate a long bus loop');
  });

  test(`${source}: new station IDs, deletion and reassignment update boarding advice automatically`, () => {
    const removed = stops.filter(stop => stop.id !== 'station01');
    assert.equal(createRoutePlanner(removed, paths).boarding('station21', 'station02', 'line1'), null);
    const replacement = { ...stops[0], id: 'future-boarding-stop' };
    assert.equal(createRoutePlanner([...removed, replacement], paths).boarding('station21', 'station02', 'line1').stationId, replacement.id);
    assert.equal(createRoutePlanner([...removed, { ...replacement, lines: ['inactive-line'] }], paths)
      .boarding('station21', 'station02', 'line1'), null);
    const renamed = stops.map((stop, index) => ({ ...stop, id: `uuid-${index}` })).reverse();
    assert.equal(createRoutePlanner(renamed, paths).boarding('uuid-20', 'uuid-1', 'line1').stationId, 'uuid-0');
  });

  test(`${source}: every boarding recommendation uses a reachable forward ride between the walking legs`, () => {
    const geometries = new Map([...paths].map(([line, path]) => [line, buildRouteGeometry(path)]));
    let recommendations = 0;
    for (const from of stops) for (const to of stops) {
      if (from.id === to.id) continue;
      const result = planner.boarding(from.id, to.id, 'line1');
      if (!result) continue;
      recommendations++;
      const original = planner.plan(from.id, to.id, 'line1');
      assert.equal(original.ride, null); assert.equal(original.alighting, null);
      const boarding = stops.find(stop => stop.id === result.stationId);
      const alighting = result.alighting ? stops.find(stop => stop.id === result.alighting.stationId) : to;
      assert.notEqual(boarding.id, from.id); assert.notEqual(boarding.id, to.id); assert.notEqual(alighting.id, from.id);
      assert.equal(result.distanceMeters, distanceMeters(from, boarding));
      assert.ok(result.distanceMeters <= MAX_NEARBY_METERS);
      assert.ok(distanceMeters(alighting, to) <= MAX_NEARBY_METERS);
      assert.ok(boarding.lines.includes(result.line) && alighting.lines.includes(result.line));
      const geometry = geometries.get(result.line);
      const start = locateStopOnRoute(boarding, geometry), end = locateStopOnRoute(alighting, geometry);
      assert.ok(end.distanceFromStart > start.distanceFromStart);
      assert.ok(Math.abs(pathDistanceMeters(result.path) - (end.distanceFromStart - start.distanceFromStart + start.distanceToPath + end.distanceToPath)) < .1);
      assert.deepEqual(result.path[0], point(boarding)); assert.deepEqual(result.path.at(-1), point(alighting));
      assert.ok((result.distanceMeters + distanceMeters(alighting, to)) / 1.4 + pathDistanceMeters(result.path) / BUS_SPEED_METERS_PER_SECOND
        < distanceMeters(from, to) / 1.4);
    }
    assert.ok(recommendations > 0);
  });
}

test('boarding fallback supports arbitrary service lines and rejects distant or invalid origins', () => {
  const from = { id: 'home', lat: .001, lng: .001, lines: [] };
  const boarding = { id: 'new-stop', lat: 0, lng: .001, lines: ['new-service'] };
  const to = { id: 'destination', lat: 0, lng: .01, lines: ['new-service'] };
  const paths = new Map([['new-service', [{ lat: 0, lng: 0 }, { lat: 0, lng: .02 }]]]);
  const planner = createRoutePlanner([from, boarding, to], paths);
  assert.equal(planner.boarding(from.id, to.id, 'line1').stationId, boarding.id);
  for (const lat of [.006, NaN]) {
    assert.equal(createRoutePlanner([{ ...from, lat }, boarding, to], paths).boarding(from.id, to.id), null);
  }
  assert.equal(planner.boarding(from.id, from.id), null);
  assert.equal(planner.boarding('missing', to.id), null);
  assert.equal(createRoutePlanner([from, boarding, to], new Map()).boarding(from.id, to.id), null);
});

test('nearby stops cannot board a reverse ride or return to the selected origin', () => {
  const from = { id: 'from', lat: 0, lng: .021, lines: ['line1'] };
  const boarding = { id: 'boarding', lat: 0, lng: .019, lines: ['line1'] };
  const to = { id: 'to', lat: 0, lng: .018, lines: ['line1'] };
  const paths = new Map([['line1', [{ lat: 0, lng: 0 }, { lat: 0, lng: .022 }]]]);
  assert.equal(createRoutePlanner([from, boarding, to], paths).boarding(from.id, to.id), null);
});
