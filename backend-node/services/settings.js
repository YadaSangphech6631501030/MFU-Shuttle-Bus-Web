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
  // Normalize editable labels and custom rows before persisting shared settings.
  const customStatuses = value.customStatuses ?? [];
  if (!Array.isArray(customStatuses) || customStatuses.length > 20) throw new Error('Add at most 20 custom statuses');
  const ids = new Set(['low', 'medium', 'high', 'unknown']);
  // Labels are editable; stable IDs still drive range matching and alert severity.
  const names = new Set(['unknown']);
  const labels = {};
  for (const id of ['low', 'medium', 'high']) {
    const name = value.names?.[id] ?? id;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || names.has(name.trim().toLowerCase())) throw new Error('Status names must be unique and contain 1–60 characters');
    names.add(name.trim().toLowerCase());
    if (name.trim() !== id) labels[id] = name.trim();
  }
  const custom = customStatuses.map(status => {
    if (!status || typeof status.id !== 'string' || !/^custom_[a-z0-9_-]{1,70}$/.test(status.id) || ids.has(status.id)) throw new Error('Invalid or duplicate status ID');
    if (typeof status.name !== 'string' || !status.name.trim() || status.name.trim().length > 60 || names.has(status.name.trim().toLowerCase())) throw new Error('Status names must be unique and contain 1–60 characters');
    if (!Number.isSafeInteger(status.min) || status.min < 0 || !(status.max === null || (Number.isSafeInteger(status.max) && status.max >= status.min))) throw new Error('Invalid custom status range');
    if (typeof status.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(status.color)) throw new Error('Invalid custom status color');
    ids.add(status.id); names.add(status.name.trim().toLowerCase());
    return { id: status.id, name: status.name.trim(), min: status.min, max: status.max, color: status.color.toLowerCase() };
  });
  return { ...result, colors, names: labels, customStatuses: custom };
}

// Preserve the built-in IDs for existing clients; custom statuses have stable IDs.
function crowdStatuses(ranges) {
  return [
    ...['low', 'medium', 'high'].map(id => ({ id: id.toUpperCase(), name: ranges.names?.[id] || id, ...ranges[id], color: ranges.colors?.[id] || DEFAULT_CROWD_COLORS[id] })),
    ...(ranges.customStatuses || []),
  ];
}
function crowdLevel(waiting, ranges) {
  // Read older overlaps predictably; all new saves require increasing ranges.
  const match = crowdStatuses(ranges).reverse().find(({ min, max }) => waiting >= min && (max === null || waiting <= max));
  return match?.id || 'UNKNOWN';
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
  const statuses = crowdStatuses(thresholds);
  for (let index = 1; index < statuses.length; index++) {
    const previous = statuses[index - 1];
    if (previous.max === null) throw new Error(`${previous.name} must have an end. Only the last status can be unlimited.`);
    if (previous.max >= statuses[index].min) throw new Error(`${statuses[index].name} must start after ${previous.name} ends.`);
  }
  // One shared document keeps the same ranges and colors for every station and client.
  await db.collection('settings').updateOne(
    { _id: 'crowd-thresholds' },
    { $set: { ...thresholds, updatedAt: new Date() } },
    { upsert: true },
  );
  return thresholds;
}

module.exports = { crowdStatuses, DEFAULT_CROWD_COLORS, crowdLevel, DEFAULT_CROWD_THRESHOLDS, normalizeCrowdThresholds, getCrowdThresholds, saveCrowdThresholds };
