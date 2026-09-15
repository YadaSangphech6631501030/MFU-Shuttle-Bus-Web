import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, findRide, findBoardingStop } from '../src/routePlanning.ts';

const stop = (id, lng, lines = ['line1']) => ({ id, lat: 0, lng, lines });
const from = stop('origin', 0);
const destination = stop('destination', .003);
const near = stop('near', .0002);
const blocked = stop('blocked', .00001);
const paths = new Map([['line1', [from, blocked, near, destination, stop('end', .004)]]]);
const rules = () => ({ allowed: {}, everywhere: new Set(), blockedDestinations: new Set(),
  blockedPairs: new Set(['origin:destination', 'blocked:destination']) });

test('chooses boarding near the origin with a directed ride to the destination', () => {
  const result = findBoardingStop(from, destination, [from, destination, blocked, near], paths, rules());
  assert.equal(result.stationId, 'near');
  assert.equal(result.line, 'line1');
  assert.ok(result.distanceMeters > 22 && result.distanceMeters < 23);
  assert.deepEqual(result.path[0], { lat: near.lat, lng: near.lng });
  assert.deepEqual(result.path.at(-1), { lat: destination.lat, lng: destination.lng });
});

test('does not suggest an alternative for a direct ride or the same origin', () => {
  const unrestricted = rules();
  unrestricted.blockedPairs.clear();
  assert.equal(findBoardingStop(from, destination, [near], paths, unrestricted), null);
  assert.equal(findBoardingStop(from, from, [near], paths, rules()), null);
});

test('checks the boarding station rules, not whether the origin can reach it', () => {
  const restricted = rules();
  restricted.allowed.near = new Set(['other']);
  assert.equal(findBoardingStop(from, destination, [near], paths, restricted), null);
  restricted.allowed = {};
  restricted.blockedDestinations.add('destination');
  assert.equal(findBoardingStop(from, destination, [near], paths, restricted), null);
  const originBlocked = rules();
  originBlocked.blockedPairs.add('origin:near');
  assert.equal(findBoardingStop(from, destination, [near], paths, originBlocked).stationId, 'near');
});

test('rejects reverse-direction boarding stations and unavailable lines', () => {
  const after = stop('after', .004);
  assert.equal(findBoardingStop(from, destination, [after], paths, rules()), null);
  assert.equal(findBoardingStop(from, destination, [near], new Map(), rules()), null);
  assert.equal(findBoardingStop(from, destination, [{ ...near, lines: ['line2'] }], paths, rules()), null);
  assert.equal(findRide(near, from, paths, rules()), null);
});

test('a permitted loop wraps in route order and never reverses points', () => {
  const loop = new Map([['line1', [from, near, stop('p2', .004), from]]]);
  const allowed = rules();
  allowed.allowed.near = new Set(['origin']);
  const ride = findRide(near, from, loop, allowed);
  assert.equal(ride.path[1].lng, .004);
  assert.equal(findRide(near, from, paths, allowed), null);
});

test('500 m limit is measured from the origin, not the destination', () => {
  const farDestination = stop('destination', .02);
  const nearDestination = stop('nearDestination', .0199);
  const longerPath = new Map([['line1', [from, near, nearDestination, farDestination]]]);
  assert.equal(findBoardingStop(from, farDestination, [nearDestination], longerPath, rules()), null);
  assert.equal(findBoardingStop(from, farDestination, [near], longerPath, rules()).stationId, 'near');
});

test('rejects invalid coordinates and missing geometry', () => {
  assert.equal(findBoardingStop(from, destination, [{ ...near, lat: NaN }], paths, rules()), null);
  assert.equal(findBoardingStop({ ...from, lng: Infinity }, destination, [near], paths, rules()), null);
  assert.equal(findBoardingStop(from, { ...destination, lng: Infinity }, [near], paths, rules()), null);
  assert.equal(findBoardingStop(from, destination, [near], new Map([['line1', []]]), rules()), null);
});

test('boarding can use another line serving the destination and updates when a stop is removed', () => {
  const toBoth = { ...destination, lines: ['line1', 'line3'] };
  const closer = stop('closer', .00005, ['line3']);
  const allPaths = new Map([...paths, ['line3', [closer, toBoth]]]);
  assert.equal(findBoardingStop(from, toBoth, [near, closer], allPaths, rules()).stationId, 'closer');
  assert.equal(findBoardingStop(from, toBoth, [near], allPaths, rules()).stationId, 'near');
});

test('great-circle distance handles coincident and antipodal coordinates', () => {
  assert.equal(distanceMeters(from, from), 0);
  assert.ok(Number.isFinite(distanceMeters(from, { lat: 0, lng: 180 })));
});
