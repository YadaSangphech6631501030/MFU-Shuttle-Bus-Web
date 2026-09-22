export type Point = { lat: number; lng: number };
export type RoutePosition = {
  point: Point;
  distanceFromStart: number;
  distanceToPath: number;
  bearing: number;
  sideMeters: number;
};
type Segment = { start: Point; end: Point; index: number; length: number; progress: number; bearing: number };
export type RouteGeometry = { points: Point[]; segments: Segment[]; distances: number[]; length: number; closed: boolean };

export const MAX_STOP_OFFSET_METERS = 50;
const MATCH_TOLERANCE_METERS = 2;
const SIDE_TOLERANCE_METERS = 0.5;
const EARTH_RADIUS = 6371000;
const RADIANS = Math.PI / 180;

export function validPoint(point: Point) {
  return Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}

export function distanceMeters(a: Point, b: Point) {
  if (!validPoint(a) || !validPoint(b)) return Infinity;
  const h = Math.sin((b.lat - a.lat) * RADIANS / 2) ** 2
    + Math.cos(a.lat * RADIANS) * Math.cos(b.lat * RADIANS)
    * Math.sin((b.lng - a.lng) * RADIANS / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function pathDistanceMeters(path: Point[]) {
  return path.slice(1).reduce((sum, point, index) => sum + distanceMeters(path[index]!, point), 0);
}

export function buildRouteGeometry(path: Point[]): RouteGeometry | null {
  if (path.length < 2 || !path.every(validPoint)) return null;
  const gap = distanceMeters(path[0]!, path[path.length - 1]!);
  const closed = gap <= 10;
  const points = closed && gap > 0 ? [...path, path[0]!] : path;
  const segments: Segment[] = [];
  const distances = [0];
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const segmentLength = distanceMeters(start, end);
    if (segmentLength > 0) {
      const dx = (end.lng - start.lng) * Math.cos((start.lat + end.lat) / 2 * RADIANS);
      const dy = end.lat - start.lat;
      const bearing = (Math.atan2(dx, dy) / RADIANS + 360) % 360;
      segments.push({ start, end, index, length: segmentLength, progress: length, bearing });
    }
    length += segmentLength;
    distances.push(length);
  }
  return length > 1 ? { points, segments, distances, length, closed } : null;
}

function angleDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// Project onto segments, not sampled vertices. Each distinct pass remains separate.
// MFU traffic keeps left: a roadside stop distinguishes opposing passes of a shared road.
// A centre-line tie needs an explicit per-line bearing; never choose the first pass by ID.
export function locateStopOnRoute(stop: Point, route: RouteGeometry, bearing?: number): RoutePosition | null {
  if (!validPoint(stop) || (bearing !== undefined && (!Number.isFinite(bearing) || bearing < 0 || bearing >= 360))) return null;
  const candidates: (RoutePosition & { index: number })[] = [];
  for (const segment of route.segments) {
    if (bearing !== undefined && angleDifference(segment.bearing, bearing) > 60) continue;
    const { start, end } = segment;
    const scaleX = EARTH_RADIUS * RADIANS * Math.cos((start.lat + end.lat) / 2 * RADIANS);
    const scaleY = EARTH_RADIUS * RADIANS;
    const dx = (end.lng - start.lng) * scaleX;
    const dy = (end.lat - start.lat) * scaleY;
    const x = (stop.lng - start.lng) * scaleX;
    const y = (stop.lat - start.lat) * scaleY;
    const t = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx ** 2 + dy ** 2)));
    const point = { lat: start.lat + (end.lat - start.lat) * t, lng: start.lng + (end.lng - start.lng) * t };
    const distanceToPath = distanceMeters(stop, point);
    if (distanceToPath > MAX_STOP_OFFSET_METERS) continue;
    candidates.push({ point, index: segment.index, distanceToPath, bearing: segment.bearing,
      distanceFromStart: segment.progress + segment.length * t,
      sideMeters: (dx * y - dy * x) / Math.hypot(dx, dy) });
  }
  if (!candidates.length) return null;
  const nearest = Math.min(...candidates.map(candidate => candidate.distanceToPath));
  const groups: typeof candidates[] = [];
  for (const candidate of candidates.filter(candidate => candidate.distanceToPath <= nearest + MATCH_TOLERANCE_METERS)) {
    const group = groups[groups.length - 1];
    if (group && candidate.index <= group[group.length - 1]!.index + 1
      && candidate.distanceFromStart - group[group.length - 1]!.distanceFromStart <= MAX_STOP_OFFSET_METERS * 2) group.push(candidate);
    else groups.push([candidate]);
  }
  const closest = (group: typeof candidates) => group.reduce((a, b) => a.distanceToPath <= b.distanceToPath ? a : b);
  let passes = groups.map(closest);
  // Two segments meeting at the loop seam are one visit, not an ambiguous second stop.
  if (route.closed && passes.length > 1
    && groups[0]![0]!.index === route.segments[0]!.index
    && groups[groups.length - 1]![groups[groups.length - 1]!.length - 1]!.index === route.segments[route.segments.length - 1]!.index
    && passes[0]!.distanceFromStart + route.length - passes[passes.length - 1]!.distanceFromStart <= MAX_STOP_OFFSET_METERS * 2) {
    groups[0]!.push(...groups.pop()!);
    passes = groups.map(closest);
  }
  // Near a corner, the incoming segment can be the left curb even when the
  // next segment is a few centimetres closer. They still belong to the same visit.
  const left = groups.map(group => group.filter(candidate => candidate.sideMeters > SIDE_TOLERANCE_METERS))
    .filter(group => group.length).map(closest);
  const match = passes.length === 1 ? passes[0] : left.length === 1 ? left[0] : null;
  if (!match) return null;
  return { ...match, distanceFromStart: route.closed && route.length - match.distanceFromStart < 0.01 ? 0 : match.distanceFromStart };
}

export function forwardRoutePath(from: Point, to: Point, start: RoutePosition, end: RoutePosition, route: RouteGeometry): Point[] | null {
  // The coordinate order describes one passenger run. A closed drawing does not
  // authorize staying aboard after the terminus and starting another run.
  // Keep this boundary for direct rides and every alighting candidate alike.
  const distance = end.distanceFromStart - start.distanceFromStart;
  if (distance < 0.01) return null;
  const interior = route.points.filter((_, index) => route.distances[index]! > start.distanceFromStart
    && route.distances[index]! < end.distanceFromStart);
  const points = [from, start.point, ...interior, end.point, to];
  return points.filter((point, index) => index === 0 || distanceMeters(points[index - 1]!, point) > 0.001)
    .map(({ lat, lng }) => ({ lat, lng }));
}
