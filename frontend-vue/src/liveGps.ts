import type { Bus } from './services/api';

export const ETA_MAX_AGE_MS = 30000;
export const LAST_POSITION_MAX_AGE_MS = 300000;

// Keep a fixed display anchor across consecutive stopped reports, not the previous raw GPS fix.
export function holdStoppedPosition(previousStatus: string | undefined, bus: Bus, distanceFromAnchor: number) {
  return previousStatus === 'STOPPED' && bus.status === 'STOPPED'
    && Number.isFinite(distanceFromAnchor) && distanceFromAnchor <= 15;
}

export function gpsAgeMs(bus: Bus, now: number) {
  const timestamp = bus.lastGpsAt ? Date.parse(bus.lastGpsAt) : NaN;
  return Number.isFinite(timestamp) ? now - timestamp : Infinity;
}

export function canEstimateArrival(bus: Bus, now: number) {
  const age = gpsAgeMs(bus, now);
  return bus.feedHealthy === true && bus.connectionStatus === 'fresh' && age >= 0 && age <= ETA_MAX_AGE_MS
    && bus.status === 'RUNNING' && typeof bus.speedKph === 'number' && Number.isFinite(bus.speedKph) && bus.speedKph > 1;
}

export function lastKnownPosition(bus: Bus, now: number) {
  const age = gpsAgeMs(bus, now);
  if (age < 0 || age > LAST_POSITION_MAX_AGE_MS || typeof bus.lat !== 'number' || typeof bus.lng !== 'number'
    || !Number.isFinite(bus.lat) || !Number.isFinite(bus.lng) || Math.abs(bus.lat) > 90 || Math.abs(bus.lng) > 180) return null;
  return { lat: bus.lat, lng: bus.lng };
}

export function interpolatePosition(from: { lat: number; lng: number }, to: { lat: number; lng: number }, fraction: number) {
  const t = Math.max(0, Math.min(1, fraction));
  const eased = t * t * (3 - 2 * t);
  return { lat: from.lat + (to.lat - from.lat) * eased, lng: from.lng + (to.lng - from.lng) * eased };
}
