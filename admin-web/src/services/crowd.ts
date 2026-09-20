import type { CrowdThresholds, CrowdStatus } from '../types';
export function crowdStatuses(ranges: CrowdThresholds): CrowdStatus[] {
  return [
    ...(['low', 'medium', 'high'] as const).map(id => ({ id: id.toUpperCase(), name: ranges.names?.[id] || id, ...ranges[id], color: ranges.colors?.[id] || DEFAULT_CROWD_COLORS[id] })),
    ...(ranges.customStatuses || []),
  ];
}
export function crowdLevel(waiting: number, ranges: CrowdThresholds): string {
  return crowdStatuses(ranges).reverse().find(({ min, max }) => waiting >= min && (max === null || waiting <= max))?.id || 'UNKNOWN';
}
export function crowdSeverity(level: string, ranges: CrowdThresholds): number {
  return crowdStatuses(ranges).findIndex(status => status.id === level);
}
export function crowdLabel(level: string, ranges: CrowdThresholds, text: Record<string, any>): string {
  if (['LOW', 'MEDIUM', 'HIGH'].includes(level)) return ranges.names?.[level.toLowerCase() as 'low' | 'medium' | 'high'] || text[level.toLowerCase()];
  return ranges.customStatuses?.find(status => status.id === level)?.name || (text.language === 'TH' ? 'นอกช่วงที่กำหนด' : 'Outside ranges');
}

// Accept old servers during a rolling deployment without crashing the page.
export function normalizeCrowdRanges(value: unknown): CrowdThresholds {
  if (!value || typeof value !== 'object') throw new Error('Invalid crowd settings response');
  const data = value as Record<string, unknown>;
  if (Number.isSafeInteger(data.medium) && Number.isSafeInteger(data.high)) {
    const medium = data.medium as number;
    const high = data.high as number;
    if (medium < 1 || high <= medium) throw new Error('Invalid crowd settings response');
    return { low: { min: 0, max: medium - 1 }, medium: { min: medium, max: high - 1 }, high: { min: high, max: null } };
  }
  for (const level of ['low', 'medium', 'high']) {
    const range = data[level] as { min?: unknown; max?: unknown } | undefined;
    if (!range || !Number.isSafeInteger(range.min) || (range.min as number) < 0 ||
      !(range.max === null || (Number.isSafeInteger(range.max) && (range.max as number) >= (range.min as number)))) {
      throw new Error('Invalid crowd settings response');
    }
  }
  return value as CrowdThresholds;
}

export const DEFAULT_CROWD_COLORS = { low: '#2eb85c', medium: '#f59e0b', high: '#dc3545' };
export function crowdColor(level: string, ranges: CrowdThresholds): string {
  // Older saved settings may not include colors; unmatched counts use neutral gray.
  const key = level.toLowerCase() as keyof typeof DEFAULT_CROWD_COLORS;
  const color = ranges.customStatuses?.find(status => status.id === level)?.color || ranges.colors?.[key];
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_CROWD_COLORS[key] || '#64748b';
}
