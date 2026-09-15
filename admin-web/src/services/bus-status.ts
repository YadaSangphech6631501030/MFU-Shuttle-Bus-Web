import type { Bus } from '../types';

export type BusActivity = 'driving' | 'waiting' | 'parked';

// Passenger waiting is an explicit activity, not something GPS age can establish.
export function busActivity(bus: Bus): BusActivity | null {
  if (bus.status === 'RUNNING') return 'driving';
  if (bus.status === 'WAITING') return 'waiting';
  if (bus.status === 'STOPPED') return 'parked';
  return null;
}
