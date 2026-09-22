import { buildRouteGeometry, distanceMeters, forwardRoutePath, locateStopOnRoute, pathDistanceMeters, validPoint, type Point } from './routeGeometry.ts';
export { distanceMeters, pathDistanceMeters, type Point } from './routeGeometry.ts';

export type Stop = Point & { id: string; lines?: string[]; routeBearings?: Record<string, number> };
export type Ride = { line: string; path: Point[] };
export type AlightingSuggestion = Ride & { stationId: string; distanceMeters: number };
export type BoardingSuggestion = Ride & { stationId: string; distanceMeters: number; alighting: AlightingSuggestion | null };
export type TripPlan = { ride: Ride | null; alighting: AlightingSuggestion | null };
// Straight-line walking proximity, not a pedestrian route or crossing instruction.
export const MAX_NEARBY_METERS = 500;
export const BUS_SPEED_METERS_PER_SECOND = 8.33;
const WALK_SPEED_METERS_PER_SECOND = 1.4;
const MIN_ALIGHTING_SAVING_SECONDS = 60;

// Rebuild from the current geometry and stops. No station IDs, pair allowlists or fixed count.
export function createRoutePlanner(stops: Stop[], paths: Map<string, Point[]>) {
  const stations = new Map(stops.map(stop => [stop.id, stop]));
  const lines = [...paths].flatMap(([line, path]) => {
    const route = buildRouteGeometry(path);
    if (!route) return [];
    const positions = new Map(stops.filter(stop => stop.lines?.includes(line))
      .map(stop => [stop.id, locateStopOnRoute(stop, route,
        stop.routeBearings && Object.prototype.hasOwnProperty.call(stop.routeBearings, line) ? stop.routeBearings[line] : undefined)]));
    return [{ line, route, positions }];
  });
  function ride(fromId: string, toId: string, onLine?: string): Ride | null {
    const from = stations.get(fromId);
    const to = stations.get(toId);
    if (!from || !to || fromId === toId) return null;
    let best: Ride | null = null;
    let bestDistance = Infinity;
    for (const { line, route, positions } of lines) {
      if (onLine !== undefined && line !== onLine) continue;
      const start = positions.get(fromId);
      const end = positions.get(toId);
      if (!start || !end) continue;
      const path = forwardRoutePath(from, to, start, end, route);
      if (!path) continue;
      const distance = pathDistanceMeters(path);
      if (distance < bestDistance) {
        best = { line, path };
        bestDistance = distance;
      }
    }
    return best;
  }
  function alighting(fromId: string, toId: string, onLine?: string): AlightingSuggestion | null {
    const from = stations.get(fromId);
    const to = stations.get(toId);
    if (!from || !to || fromId === toId || !validPoint(from) || !validPoint(to)) return null;
    const direct = ride(fromId, toId, onLine);
    const directSeconds = direct ? pathDistanceMeters(direct.path) / BUS_SPEED_METERS_PER_SECOND : Infinity;
    let best: AlightingSuggestion | null = null;
    let bestSeconds = Infinity;
    for (const stop of stations.values()) {
      if (stop.id === fromId || stop.id === toId) continue;
      const walkMeters = distanceMeters(stop, to);
      if (walkMeters > MAX_NEARBY_METERS) continue;
      const candidate = ride(fromId, stop.id, onLine);
      if (!candidate) continue;
      const seconds = pathDistanceMeters(candidate.path) / BUS_SPEED_METERS_PER_SECOND + walkMeters / WALK_SPEED_METERS_PER_SECOND;
      if (seconds + MIN_ALIGHTING_SAVING_SECONDS > directSeconds) continue;
      if (!best || seconds < bestSeconds || (seconds === bestSeconds && (walkMeters < best.distanceMeters
        || (walkMeters === best.distanceMeters && stop.id.localeCompare(best.stationId) < 0)))) {
        best = { ...candidate, stationId: stop.id, distanceMeters: walkMeters };
        bestSeconds = seconds;
      }
    }
    return best;
  }
  function plan(fromId: string, toId: string, preferredLine?: string): TripPlan {
    // A line preference is a service policy, never a station-ID exception.
    // Apply it to the whole trip so a faster secondary-line ride cannot suppress
    // an opposite-side alighting recommendation on the primary line.
    if (preferredLine && stations.get(fromId)?.lines?.includes(preferredLine)
      && stations.get(toId)?.lines?.includes(preferredLine)) {
      const preferred = { ride: ride(fromId, toId, preferredLine), alighting: alighting(fromId, toId, preferredLine) };
      if (preferred.ride || preferred.alighting) return preferred;
    }
    const direct = ride(fromId, toId);
    // For destinations served only by another line, keep the recommendation on
    // that line as well. Explicit line filters already restrict the supplied paths.
    return { ride: direct, alighting: alighting(fromId, toId, direct?.line) };
  }
  function boarding(fromId: string, toId: string, preferredLine?: string): BoardingSuggestion | null {
    const from = stations.get(fromId), to = stations.get(toId);
    if (!from || !to || fromId === toId || !validPoint(from) || !validPoint(to)) return null;
    const original = plan(fromId, toId, preferredLine);
    // Keep existing trips and alighting advice. Walking to another boarding stop
    // is a fallback when the selected origin cannot supply a useful ride.
    if (original.ride || original.alighting) return null;
    const directWalkSeconds = distanceMeters(from, to) / WALK_SPEED_METERS_PER_SECOND;
    const candidates: { suggestion: BoardingSuggestion; seconds: number; walking: number }[] = [];
    for (const stop of stations.values()) {
      if (stop.id === fromId || stop.id === toId) continue;
      const walkMeters = distanceMeters(from, stop);
      if (walkMeters > MAX_NEARBY_METERS) continue;
      for (const { line } of lines) {
        const direct = ride(stop.id, toId, line);
        const alternative = alighting(stop.id, toId, line);
        const actual = alternative || direct;
        if (!actual || alternative?.stationId === fromId) continue;
        const walking = walkMeters + (alternative?.distanceMeters || 0);
        const seconds = walking / WALK_SPEED_METERS_PER_SECOND + pathDistanceMeters(actual.path) / BUS_SPEED_METERS_PER_SECOND;
        // Do not suggest walking past a nearby destination just to ride a long
        // circuit back. This is the same straight-line walking estimate as above.
        if (seconds >= directWalkSeconds) continue;
        candidates.push({ suggestion: { ...actual, stationId: stop.id, distanceMeters: walkMeters, alighting: alternative }, seconds, walking });
      }
    }
    // A walk can reach another line, but campus destinations still prefer line 1
    // when it offers a useful trip. Explicit filters restrict `paths` already.
    const preferred = preferredLine && to.lines?.includes(preferredLine)
      ? candidates.filter(candidate => candidate.suggestion.line === preferredLine) : [];
    const ranked = preferred.length ? preferred : candidates;
    ranked.sort((a, b) => a.seconds - b.seconds || a.walking - b.walking
      || a.suggestion.stationId.localeCompare(b.suggestion.stationId) || a.suggestion.line.localeCompare(b.suggestion.line));
    return ranked[0]?.suggestion || null;
  }
  return { ride, alighting, plan, boarding };
}

export function findRide(from: Stop, to: Stop, paths: Map<string, Point[]>): Ride | null {
  return createRoutePlanner([from, to], paths).ride(from.id, to.id);
}

export function findAlightingStop(from: Stop, to: Stop, stops: Stop[], paths: Map<string, Point[]>): AlightingSuggestion | null {
  return createRoutePlanner([...stops.filter(stop => stop.id !== from.id && stop.id !== to.id), from, to], paths).alighting(from.id, to.id);
}
