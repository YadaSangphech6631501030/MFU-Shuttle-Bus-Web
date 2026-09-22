import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoutePlanner, distanceMeters, pathDistanceMeters } from '../src/routePlanning.ts';
import { buildRouteGeometry, locateStopOnRoute } from '../src/routeGeometry.ts';

const readJson = relative => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
const stations = readJson('../../docker/mongo-init/backup/shuttlebus_system.stations.json')
  .map(station => station.id === 'station01' ? { ...station, lines: ['line1', 'line2'] } : station);
const defaults = readJson('../../backend-node/seed/route_defaults.json');

for (const line of ['line1', 'line2']) {
  const asset = readJson(`../assets/routes/polyline_${line}_mfu.geojson`);
  for (const [source, geometry] of [['asset', asset.features[0].geometry], ['API default', defaults.find(route => route.id === line).geometry]]) {
    const path = geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const route = buildRouteGeometry(path);
    const paths = new Map([[line, path]]);
    const planner = createRoutePlanner(stations, paths);
    const served = stations.filter(stop => stop.lines.includes(line));

    test(`${line} ${source}: all existing stops match a directed route visit without ID rules`, () => {
      for (const stop of served) assert.ok(locateStopOnRoute(stop, route), stop.id);
      // Opposing curb pairs must match the correct pass through the shared road.
      for (const [outbound, inbound] of [['station03', 'station18'], ['station04', 'station17'],
        ['station05', 'station16'], ['station06', 'station15'], ['station10', 'station13']]) {
        const a = locateStopOnRoute(stations.find(stop => stop.id === outbound), route);
        const b = locateStopOnRoute(stations.find(stop => stop.id === inbound), route);
        assert.ok(a.distanceFromStart < b.distanceFromStart, `${outbound}/${inbound}`);
      }
    });

    test(`${line} ${source}: Lamduan 2 to M-Square still recommends Oval Pond and a 21 m walk`, () => {
      const result = planner.alighting('station01', 'station14');
      assert.equal(result.stationId, 'station09');
      assert.equal(Math.round(result.distanceMeters), 21);
      assert.ok(pathDistanceMeters(planner.ride('station01', 'station14').path) > pathDistanceMeters(result.path) + 1400);
    });

    test(`${line} ${source}: F Parking to outbound dormitory stops alights before the terminus`, () => {
      for (const [destination, alighting, walk] of [['station01', 'station20', 94], ['station02', 'station19', 25]]) {
        assert.equal(planner.ride('station07', destination), null);
        const suggestion = planner.alighting('station07', destination);
        assert.equal(suggestion.stationId, alighting);
        assert.equal(Math.round(suggestion.distanceMeters), walk);
        assert.ok(suggestion.path.some(point => point.lat < 20.044));
      }
    });

    test(`${line} ${source}: every served station pair stays within a single passenger run`, () => {
      for (const from of served) for (const to of served) {
        if (from.id === to.id) continue;
        const start = locateStopOnRoute(from, route), end = locateStopOnRoute(to, route);
        const expected = end.distanceFromStart - start.distanceFromStart;
        const ride = planner.ride(from.id, to.id);
        if (expected <= 0) assert.equal(ride, null, `${from.id}->${to.id} crosses the terminus`);
        else {
          assert.ok(ride, `${from.id}->${to.id}`);
          const measured = pathDistanceMeters(ride.path);
          assert.ok(Math.abs(measured - expected - start.distanceToPath - end.distanceToPath) < .1, `${from.id}->${to.id}: ${measured}/${expected}`);
        }
        const suggestion = planner.alighting(from.id, to.id);
        if (suggestion) {
          const stop = stations.find(stop => stop.id === suggestion.stationId);
          const alighting = locateStopOnRoute(stop, route);
          assert.ok(alighting.distanceFromStart > start.distanceFromStart, `${from.id}->${to.id}: alighting must be ahead`);
          const expectedRide = alighting.distanceFromStart - start.distanceFromStart + start.distanceToPath + alighting.distanceToPath;
          assert.ok(Math.abs(pathDistanceMeters(suggestion.path) - expectedRide) < .1, `${from.id}->${to.id}: alighting must not wrap`);
          assert.ok(distanceMeters(stop, to) <= 500);
          assert.deepEqual(suggestion.path[0], { lat: from.lat, lng: from.lng });
          assert.deepEqual(suggestion.path.at(-1), { lat: stop.lat, lng: stop.lng });
        }
      }
    });

    test(`${line} ${source}: a newly inserted stop works and renaming all IDs changes no routes`, () => {
      const newStop = { id: 'future-stop-9000', lat: 20.04829, lng: 99.892822, lines: [line] };
      assert.ok(createRoutePlanner([...stations, newStop], paths).ride('station01', newStop.id));
      assert.equal(planner.ride('station01', newStop.id), null);
      const renamed = stations.map((stop, index) => ({ ...stop, id: `uuid-${1000 - index}` }));
      const next = createRoutePlanner([...renamed].reverse(), paths);
      assert.deepEqual(next.ride(renamed[0].id, renamed[13].id), planner.ride('station01', 'station14'));
      const result = next.alighting(renamed[0].id, renamed[13].id);
      assert.equal(result.stationId, renamed[8].id);
    });

    test(`${line} ${source}: Lamduan 2 starts the run and Minimart ends it for every station`, () => {
      const ordered = served.toSorted((a, b) => locateStopOnRoute(a, route).distanceFromStart - locateStopOnRoute(b, route).distanceFromStart);
      assert.equal(ordered[0].id, 'station01');
      assert.equal(ordered.at(-1).id, 'station21');
      for (const stop of served) {
        if (stop.id !== 'station01') {
          assert.ok(planner.ride('station01', stop.id));
          assert.equal(planner.ride(stop.id, 'station01'), null);
        }
        if (stop.id !== 'station21') {
          assert.ok(planner.ride(stop.id, 'station21'));
          assert.equal(planner.ride('station21', stop.id), null);
          assert.equal(planner.alighting('station21', stop.id), null);
        }
      }
    });

    test(`${line} ${source}: removing endpoint stations or changing IDs cannot reopen another lap`, () => {
      const remaining = stations.filter(stop => !['station01', 'station21'].includes(stop.id))
        .map(stop => ({ ...stop, id: `renamed-${stop.id}` })).reverse();
      const next = createRoutePlanner(remaining, paths);
      assert.equal(next.ride('renamed-station20', 'renamed-station02'), null);
      assert.ok(next.ride('renamed-station02', 'renamed-station20'));
      assert.equal(next.alighting('renamed-station07', 'renamed-station02').stationId, 'renamed-station19');
    });
  }
}
