const DEFAULT_CROWD_COLORS = { low: '#2eb85c', medium: '#f59e0b', high: '#dc3545' };
const DEFAULT_CROWD_THRESHOLDS = { low: { min: 0, max: 5 }, medium: { min: 6, max: 9 }, high: { min: 10, max: null } };

function normalizeCrowdThresholds(value) {
  if (!value || typeof value !== 'object') throw new Error('Crowd ranges are required');
  const result = {};
  for (const level of ['low', 'medium', 'high']) {
    const range = value[level];
    if (!range || !Number.isSafeInteger(range.min) || range.min < 0 ||
      !(range.max === null || (Number.isSafeInteger(range.max) && range.max >= range.min))) {
      throw new Error(`${level}: enter a non-negative integer range with end at least start`);
    }
    result[level] = { min: range.min, max: range.max };
  }
  const colors = {};
  for (const level of ['low', 'medium', 'high']) {
    const color = value.colors?.[level] ?? DEFAULT_CROWD_COLORS[level];
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`${level}: color must be a six-digit hex color`);
    colors[level] = color.toLowerCase();
  }
  return { ...result, colors };
}

function crowdLevel(waiting, ranges) {
  // Ends are inclusive; null means unlimited. Keep severity priority for older saved
  // overlaps, but reject overlaps on new saves. Gaps intentionally return UNKNOWN.
  for (const level of ['high', 'medium', 'low']) {
    const { min, max } = ranges[level];
    if (waiting >= min && (max === null || waiting <= max)) return level.toUpperCase();
  }
  return 'UNKNOWN';
}

async function getCrowdThresholds(db) {
  const document = await db.collection('settings').findOne({ _id: 'crowd-thresholds' });
  // Convert the old two-threshold format on read without rewriting stored settings.
  if (document && Number.isSafeInteger(document.medium) && Number.isSafeInteger(document.high)) {
    return normalizeCrowdThresholds({ low: { min: 0, max: document.medium - 1 }, medium: { min: document.medium, max: document.high - 1 }, high: { min: document.high, max: null } });
  }
  try { return normalizeCrowdThresholds(document || DEFAULT_CROWD_THRESHOLDS); }
  catch { return normalizeCrowdThresholds(DEFAULT_CROWD_THRESHOLDS); }
}

async function saveCrowdThresholds(db, value) {
  // Validate before the database write: an invalid form must never replace saved settings.
  const thresholds = normalizeCrowdThresholds(value);
  if (thresholds.low.max === null || thresholds.medium.max === null) {
    throw new Error('Low and Medium must have an end. Only High can be unlimited.');
  }
  if (thresholds.low.max >= thresholds.medium.min) {
    throw new Error('Medium must start after Low ends.');
  }
  if (thresholds.medium.max >= thresholds.high.min) {
    throw new Error('High must start after Medium ends.');
  }
  // One shared document keeps the same ranges and colors for every station and client.
  await db.collection('settings').updateOne(
    { _id: 'crowd-thresholds' },
    { $set: { ...thresholds, updatedAt: new Date() } },
    { upsert: true },
  );
  return thresholds;
}

module.exports = { DEFAULT_CROWD_COLORS, crowdLevel, DEFAULT_CROWD_THRESHOLDS, normalizeCrowdThresholds, getCrowdThresholds, saveCrowdThresholds };
