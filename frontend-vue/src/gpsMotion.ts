import type { Bus } from './services/api';
import { ETA_MAX_AGE_MS, gpsAgeMs, lastKnownPosition } from './liveGps.ts';
import { distanceMeters } from './routePlanning.ts';
import { bearingBetween } from './arrival.ts';

// Estimate missing motion from distinct GPS fixes, never from polling elapsed time
// or a provider speed whose units have not been configured.
export function createGpsMotionEstimator() {
  const samples = new Map<string, { bus: Bus; speed?: number; heading?: number }>();
  return (buses: Bus[], now: number): Bus[] => {
    const seen = new Set<string>();
    const result = buses.map(bus => {
      const key = bus.busId || bus.busNumber || bus.id;
      if (!key) return bus;
      seen.add(key);
      const position = lastKnownPosition(bus, now);
      if (!position || !bus.feedHealthy || bus.connectionStatus !== 'fresh'
        || gpsAgeMs(bus, now) > ETA_MAX_AGE_MS || bus.status !== 'RUNNING') {
        samples.delete(key);
        return bus;
      }
      const previous = samples.get(key);
      const sample: { bus: Bus; speed?: number; heading?: number } = { bus: { ...bus } };
      if (previous) {
        const previousPosition = lastKnownPosition(previous.bus, now);
        const elapsed = Date.parse(bus.lastGpsAt!) - Date.parse(previous.bus.lastGpsAt!);
        if (elapsed === 0 && previous.bus.lat === bus.lat && previous.bus.lng === bus.lng) {
          sample.speed = previous.speed;
          sample.heading = previous.heading;
        } else if (previousPosition && elapsed >= 2000 && elapsed <= ETA_MAX_AGE_MS) {
          const distance = distanceMeters(previousPosition, position);
          const speed = distance / elapsed * 3600;
          // Reject small GPS jitter and implausible jumps for a campus shuttle.
          if (distance >= 5 && speed > 1 && speed <= 80) {
            sample.speed = speed;
            sample.heading = bearingBetween(previousPosition, position);
          }
        }
      }
      samples.set(key, sample);
      return {
        ...bus,
        speedKph: typeof bus.speedKph === 'number' && Number.isFinite(bus.speedKph)
          ? bus.speedKph : sample.speed ?? null,
        directionRaw: typeof bus.directionRaw === 'number' && Number.isFinite(bus.directionRaw)
          ? bus.directionRaw : sample.heading ?? null,
      };
    });
    for (const key of samples.keys()) if (!seen.has(key)) samples.delete(key);
    return result;
  };
}
