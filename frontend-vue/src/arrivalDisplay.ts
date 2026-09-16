import type { Lang } from './types';
import type { arrivalUnavailableReason } from './liveGps';

type ArrivalReason = ReturnType<typeof arrivalUnavailableReason>;

export function arrivalStatusText(reason: ArrivalReason, lang: Lang) {
  const labels = {
    routeMissing: ['รอข้อมูลเส้นทาง', 'Awaiting route data'],
    gpsMissing: ['รอ GPS ล่าสุด', 'Awaiting live GPS'],
    stopped: ['รถยังจอดอยู่', 'Bus stopped'],
    speedMissing: ['รอข้อมูลความเร็ว', 'Awaiting speed data'],
    headingMissing: ['รอทิศทางรถ', 'Awaiting heading'],
    noApproachingBus: ['ยังไม่มีรถเข้าป้าย', 'No approaching bus'],
  };
  return labels[reason][lang === 'th' ? 0 : 1];
}

export function tripTimeText(arrivalMinutes: number | null, rideMinutes: number, reason: ArrivalReason, lang: Lang) {
  const minutes = (value: number) => `${value} ${lang === 'th' ? 'นาที' : 'min'}`;
  if (arrivalMinutes === null) {
    return {
      arrival: arrivalStatusText(reason, lang),
      total: lang === 'th' ? 'รอเวลารถมาถึง' : 'Awaiting bus ETA',
    };
  }
  return { arrival: minutes(arrivalMinutes), total: minutes(arrivalMinutes + rideMinutes) };
}
