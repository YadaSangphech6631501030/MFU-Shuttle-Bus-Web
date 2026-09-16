import type { Bus } from './services/api';
import { canEstimateArrival, gpsAgeMs, lastKnownPosition, ETA_MAX_AGE_MS } from './liveGps.ts';
import { distanceMeters, type Point as RoutePoint } from './routePlanning.ts';

// Unassigned vehicles can serve a stop when their measured position and heading
// place them on an approaching route. Never substitute straight-line proximity.
export function estimateRouteArrival(station: RoutePoint, line: string, path: RoutePoint[], buses: Bus[], now: number): number | null {
  const stop = routeProgressAtPosition(station, path);
  if (!stop || stop.distanceToPath > 100) return null;
  const estimates: number[] = [];
  for (const bus of buses) {
    const assigned = String(bus.line || '').trim().toLowerCase().replace(/^(\d+)$/, 'line$1');
    if (assigned && assigned !== line) continue;
    const position = lastKnownPosition(bus, now);
    if (!position || !bus.feedHealthy || bus.connectionStatus !== 'fresh' || gpsAgeMs(bus, now) > ETA_MAX_AGE_MS) continue;
    const progress = routeProgressAtPosition(position, path);
    if (!progress || progress.distanceToPath > 100) continue;
    const delta = stop.distanceFromStart - progress.distanceFromStart;
    if (Math.abs(delta) <= 20 && distanceMeters(position, station) <= 30 && bus.status === 'STOPPED') {
      estimates.push(0);
      continue;
    }
    if (!canEstimateArrival(bus, now)) continue;
    const bearing = routeBearingAtPosition(position, path);
    if (bearing === null || typeof bus.directionRaw !== 'number' || !Number.isFinite(bus.directionRaw)) continue;
    const difference = angleDifference(bearing, bus.directionRaw);
    // A bus crossing the road is not travelling along this route.
    if (Math.min(difference, 180 - difference) > 60) continue;
    let distance = delta * (difference <= 90 ? 1 : -1);
    if (distance < 0) {
      // Campus lines are loops: a bus past this stop can reach it next lap.
      // Open paths cannot wrap or silently reverse direction.
      const closingDistance = distanceMeters(path[0]!, path[path.length - 1]!);
      if (closingDistance > 10) continue;
      distance += progress.totalDistance + closingDistance;
    }
    estimates.push(Math.max(1, Math.ceil(distance / (bus.speedKph! * 1000 / 3600) / 60)));
  }
  return estimates.length ? Math.min(...estimates) : null;
}

export function routeProgressAtPosition(position: RoutePoint, path: RoutePoint[]) {
  if (path.length < 2) return null;
  let cumulativeDistance = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestProgress = 0;
  let totalDistance = 0;

  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const deltaLng = end.lng - start.lng;
    const deltaLat = end.lat - start.lat;
    const lengthSquared = deltaLng ** 2 + deltaLat ** 2;
    const progress = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((position.lng - start.lng) * deltaLng + (position.lat - start.lat) * deltaLat) / lengthSquared));
    const closest = { lat: start.lat + deltaLat * progress, lng: start.lng + deltaLng * progress };
    const segmentDistance = distanceMeters(start, end);
    const distanceToPath = distanceMeters(position, closest);
    if (distanceToPath < nearestDistance) {
      nearestDistance = distanceToPath;
      nearestProgress = cumulativeDistance + segmentDistance * progress;
    }
    cumulativeDistance += segmentDistance;
  }

  totalDistance = cumulativeDistance;
  return { distanceFromStart: nearestProgress, distanceToPath: nearestDistance, totalDistance };
}

export function bearingBetween(from: RoutePoint, to: RoutePoint) {
  const fromLat = from.lat * Math.PI / 180;
  const toLat = to.lat * Math.PI / 180;
  const deltaLng = (to.lng - from.lng) * Math.PI / 180;
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function routeBearingAtPosition(position: RoutePoint, path: RoutePoint[]) {
  if (path.length < 2) return null;
  let nearestBearing: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const deltaLng = end.lng - start.lng;
    const deltaLat = end.lat - start.lat;
    const lengthSquared = deltaLng ** 2 + deltaLat ** 2;
    const progress = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((position.lng - start.lng) * deltaLng + (position.lat - start.lat) * deltaLat) / lengthSquared));
    const closest = { lat: start.lat + deltaLat * progress, lng: start.lng + deltaLng * progress };
    const distance = (position.lng - closest.lng) ** 2 + (position.lat - closest.lat) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestBearing = bearingBetween(start, end);
    }

  }
  return nearestBearing;
}

export function angleDifference(first: number, second: number) {
  return Math.abs(((first - second + 540) % 360) - 180);
}
