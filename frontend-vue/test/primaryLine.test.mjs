import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoutePlanner, pathDistanceMeters } from '../src/routePlanning.ts';
import { buildRouteGeometry, locateStopOnRoute } from '../src/routeGeometry.ts';

const readJson = relative => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
const stops = readJson('../../docker/mongo-init/backup/shuttlebus_system.stations.json')
  .map(stop => stop.id === 'station01' ? { ...stop, lines: ['line1', 'line2'] } : stop);
const defaults = readJson('../../backend-node/seed/route_defaults.json');

for (const source of ['asset', 'API default']) {
  // Deliberately list the secondary line first: API order must not choose the policy.
  const paths = new Map(['line2', 'line1'].map(line => {
    const geometry = source === 'asset'
      ? readJson(`../assets/routes/polyline_${line}_mfu.geojson`).features[0].geometry
      : defaults.find(route => route.id === line).geometry;
    return [line, geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))];
  }));
  const planner = createRoutePlanner(stops, paths);

  test(`${source}: automatic campus trips prefer line 1 and recommend E2 inbound for E2 outbound`, () => {
    assert.equal(planner.ride('station01', 'station13').line, 'line2', 'reproduces the shorter secondary-line ride');
    const trip = planner.plan('station01', 'station13', 'line1');
    assert.equal(trip.ride.line, 'line1');
    assert.equal(trip.alighting.line, 'line1');
    assert.equal(trip.alighting.stationId, 'station10');
    assert.equal(Math.round(trip.alighting.distanceMeters), 4);
    assert.ok(pathDistanceMeters(trip.ride.path) > pathDistanceMeters(trip.alighting.path) + 700);
    const origin = stops.find(stop => stop.id === 'station01');
    const alighting = stops.find(stop => stop.id === 'station10');
    assert.deepEqual(trip.alighting.path[0], { lat: origin.lat, lng: origin.lng });
    assert.deepEqual(trip.alighting.path.at(-1), { lat: alighting.lat, lng: alighting.lng });
  });

  test(`${source}: travel to and from the medical center stays on line 2`, () => {
    for (const [from, to] of [['station01', 'station22'], ['station22', 'station14']]) {
      const trip = planner.plan(from, to, 'line1');
      assert.equal(trip.ride.line, 'line2');
      if (trip.alighting) assert.equal(trip.alighting.line, 'line2');
    }
  });

  test(`${source}: hospital to outbound dormitories recommends a reachable stop before Minimart`, () => {
    for (const [destination, alighting, walk] of [['station01', 'station20', 94], ['station02', 'station19', 25]]) {
      const trip = planner.plan('station22', destination, 'line1');
      assert.equal(trip.ride, null, 'cannot ride through the terminus into another run');
      assert.equal(trip.alighting.line, 'line2');
      assert.equal(trip.alighting.stationId, alighting);
      assert.equal(Math.round(trip.alighting.distanceMeters), walk);
    }
    assert.equal(planner.plan('station22', 'station21', 'line1').ride.line, 'line2');
    assert.deepEqual(planner.plan('station21', 'station01', 'line1'), { ride: null, alighting: null });
    const e2 = planner.plan('station22', 'station13', 'line1');
    assert.equal(e2.ride, null, 'E2 outbound was already passed before the hospital');
    assert.equal(e2.alighting.line, 'line2');
    assert.equal(e2.alighting.stationId, 'station14');
  });

  test(`${source}: automatic plans for every station pair preserve line preference and the run boundary`, () => {
    const geometries = new Map([...paths].map(([line, path]) => [line, buildRouteGeometry(path)]));
    for (const from of stops) for (const to of stops) {
      if (from.id === to.id) continue;
      const trip = planner.plan(from.id, to.id, 'line1');
      const primary = from.lines.includes('line1') && to.lines.includes('line1')
        && (planner.ride(from.id, to.id, 'line1') || planner.alighting(from.id, to.id, 'line1'));
      for (const [ride, destination] of [[trip.ride, to], [trip.alighting, stops.find(stop => stop.id === trip.alighting?.stationId)]]) {
        if (!ride) continue;
        if (primary) assert.equal(ride.line, 'line1', `${from.id}->${to.id}`);
        assert.ok(from.lines.includes(ride.line), 'the original boarding stop must serve this line');
        assert.ok(destination.lines.includes(ride.line), 'the actual alighting stop must serve this line');
        if (from.id === 'station22' || destination.id === 'station22') assert.equal(ride.line, 'line2');
        const geometry = geometries.get(ride.line);
        const start = locateStopOnRoute(from, geometry), end = locateStopOnRoute(destination, geometry);
        assert.ok(end.distanceFromStart > start.distanceFromStart, `${from.id}->${to.id}: must not cross the terminus`);
        const expected = end.distanceFromStart - start.distanceFromStart + start.distanceToPath + end.distanceToPath;
        assert.ok(Math.abs(pathDistanceMeters(ride.path) - expected) < .1, `${from.id}->${to.id}: unexpected ride length`);
      }
    }
  });

  test(`${source}: explicit line 2 selection and unavailable primary geometry still work`, () => {
    const onlyLine2 = new Map([['line2', paths.get('line2')]]);
    const selected = createRoutePlanner(stops, onlyLine2).plan('station01', 'station13');
    assert.equal(selected.ride.line, 'line2');
    assert.equal(selected.alighting, null);
    assert.equal(createRoutePlanner(stops, onlyLine2).plan('station01', 'station13', 'line1').ride.line, 'line2');
    assert.equal(createRoutePlanner(stops, new Map([...onlyLine2, ['line1', []]]))
      .plan('station01', 'station13', 'line1').ride.line, 'line2');
  });

  test(`${source}: primary-line preference applies to new IDs without a station allowlist`, () => {
    const renamed = stops.map((stop, index) => ({ ...stop, id: `new-stop-${index + 100}` }));
    const trip = createRoutePlanner(renamed, paths).plan('new-stop-100', 'new-stop-112', 'line1');
    assert.equal(trip.ride.line, 'line1');
    assert.equal(trip.alighting.stationId, 'new-stop-109');
    assert.equal(trip.alighting.line, 'line1');
  });
}

test('a future exclusive service line is used without hospital-specific station IDs', () => {
  const a = { id: 'new-origin', lat: 0, lng: .001, lines: ['line1', 'new-service'] };
  const b = { id: 'new-destination', lat: 0, lng: .008, lines: ['new-service'] };
  const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: .01 }];
  const planner = createRoutePlanner([a, b], new Map([['line1', path], ['new-service', path]]));
  assert.equal(planner.plan(a.id, b.id, 'line1').ride.line, 'new-service');
});
