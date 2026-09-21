// Optional per-line heading for stops on exactly overlapping route segments.
// Ordinary stops continue to use automatic polyline/curb matching.
function normalizeRouteBearings(value, lines) {
  if (value === null) return { routeBearings: {} };
  if (typeof value !== 'object' || Array.isArray(value) || !value) {
    return { error: 'routeBearings must be an object keyed by route ID, or null to clear' };
  }
  const entries = Object.entries(value);
  if (entries.length > 100 || entries.some(([line, bearing]) =>
    !/^[a-z][a-z0-9_-]{0,39}$/.test(line) || ['all', 'admin'].includes(line)
    || (lines && !lines.includes(line)) || typeof bearing !== 'number'
    || !Number.isFinite(bearing) || bearing < 0 || bearing >= 360)) {
    return { error: 'routeBearings must use assigned route IDs and numeric headings from 0 up to (excluding) 360 degrees' };
  }
  return { routeBearings: Object.fromEntries(entries) };
}

module.exports = { normalizeRouteBearings };
