const database = require('../db');
const { createPublicData } = require('./public-data');
const { createBusPublisher } = require('./supabase');
const { getCrowdThresholds, crowdLevel, crowdStatuses } = require('./settings');

const publisher = createBusPublisher({ event: 'public.updated' });
const text = (source, keys) => keys.map(key => String(source[key] ?? '').trim()).find(Boolean) || '';
function stationMetadata(station) {
  const nameTH = text(station, ['nameTH', 'nameTh', 'name_th', 'thaiName', 'nameThai', 'th']);
  return { id: station.id,
    name: text(station, ['name', 'nameEN', 'nameEn', 'name_en', 'englishName', 'en']) || nameTH,
    nameTH, lat: station.lat, lng: station.lng, lines: station.lines || [],
    ...(station.routeBearings ? { routeBearings: station.routeBearings } : {}) };
}
const publicData = createPublicData({
  async loadCatalog() {
    const db = database.getDB();
    const routes = await db.collection('routes').find({ enabled: true, deletedAt: { $exists: false } },
      { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
    const stations = await db.collection('stations').find({ lines: { $in: routes.map(route => route.id) } })
      .sort({ id: 1 }).toArray();
    // Explicit public fields: never broadcast camera URLs, ROI, or detector internals.
    return { routes, stations: stations.map(stationMetadata) };
  },
  async loadCrowds() {
    const db = database.getDB();
    const [stations, thresholds] = await Promise.all([
      db.collection('stations').find({}, { projection: { _id: 0, id: 1, waiting: 1 } }).sort({ id: 1 }).toArray(),
      getCrowdThresholds(db),
    ]);
    const statuses = crowdStatuses(thresholds);
    return stations.map(station => {
      const waiting = Number.isFinite(station.waiting) ? Math.max(0, Math.floor(station.waiting)) : 0;
      const status = crowdLevel(waiting, thresholds);
      const matched = statuses.find(item => item.id === status);
      return { id: station.id, waiting, status, statusColor: matched?.color || '#64748b',
        statusLabel: status.startsWith('custom_') ? matched?.name || '' : thresholds.names?.[status.toLowerCase()] || '' };
    });
  },
  publish: event => publisher.publishSnapshot(() => event),
});
publicData.realtimeStatus = () => publisher.status();
module.exports = publicData;
