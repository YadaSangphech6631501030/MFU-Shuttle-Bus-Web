export type Point = { lat: number; lng: number };
export type Stop = Point & { id: string; lines?: string[] };
export type DirectionRules = {
  allowed: Record<string, Set<string>>;
  everywhere: Set<string>;
  blockedDestinations: Set<string>;
  blockedPairs: Set<string>;
};
export type Ride = { line: string; path: Point[] };
export type BoardingSuggestion = Ride & { stationId: string; distanceMeters: number };
// Search radius around the selected origin, measured as straight-line distance.
export const MAX_NEARBY_METERS = 500;

function validPoint(point: Point) {
  return Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}

export function distanceMeters(a: Point, b: Point) {
  // Invalid coordinates must not be ranked as nearby; this is not a road-distance estimate.
  if (!validPoint(a) || !validPoint(b)) return Infinity;
  const radians = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians)
    * Math.sin((b.lng - a.lng) * radians / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

// Keep explicit campus direction rules; unknown pairs follow polyline order only.
export function findRide(from: Stop, to: Stop, paths: Map<string, Point[]>, rules: DirectionRules): Ride | null {
  if (from.id === to.id || !validPoint(from) || !validPoint(to)) return null;
  const allowed = rules.allowed[from.id];
  if (rules.blockedPairs.has(`${from.id}:${to.id}`) || (allowed && !allowed.has(to.id))) return null;
  if (rules.blockedDestinations.has(to.id) && from.id !== to.id && !allowed?.has(to.id)) return null;
  for (const [line, path] of paths) {
    if (!from.lines?.includes(line) || !to.lines?.includes(line) || path.length < 2 || !path.every(validPoint)) continue;
    const nearest = (stop: Stop) => path.reduce((best, point, index) =>
      distanceMeters(point, stop) < distanceMeters(path[best]!, stop) ? index : best, 0);
    const start = nearest(from);
    const end = nearest(to);
    // A permitted stop behind the origin requires a closed loop, never a reversed polyline.
    if (start >= end && !allowed?.has(to.id) && !rules.everywhere.has(from.id)) continue;
    if (start >= end && distanceMeters(path[0]!, path[path.length - 1]!) > 10) continue;
    const segment = start < end ? path.slice(start + 1, end)
      : [...path.slice(start + 1), ...path.slice(1, end)];
    return { line, path: [{ lat: from.lat, lng: from.lng }, ...segment, { lat: to.lat, lng: to.lng }] };
  }
  return null;
}

// Rank boarding stops near the origin, checking each stop's directed ride to the destination.
export function findBoardingStop(from: Stop, to: Stop, stops: Stop[], paths: Map<string, Point[]>, rules: DirectionRules): BoardingSuggestion | null {
  if (from.id === to.id || findRide(from, to, paths, rules)) return null;
  const candidates = stops
    .filter((stop) => stop.id !== from.id && stop.id !== to.id)
    .map((stop) => ({ stop, distance: distanceMeters(stop, from) }))
    .filter(({ distance }) => distance <= MAX_NEARBY_METERS)
    .sort((a, b) => a.distance - b.distance || a.stop.id.localeCompare(b.stop.id));
  for (const { stop, distance } of candidates) {
    // Validate the ride from the suggested boarding stop, not from the original station.
    const ride = findRide(stop, to, paths, rules);
    if (ride) return { ...ride, stationId: stop.id, distanceMeters: distance };
  }
  return null;
}
