const { GPS } = require('../config');
const { PpgpsClient, normalizeTracker } = require('../services/gps');
const fleet = require('../config/gps-fleet.json');

(async () => {
  if (!GPS.username || !GPS.password) {
    console.error('GPS is not configured. Fill GPS_USERNAME and GPS_PASSWORD in backend-node/.env.gps.');
    process.exitCode = 1;
    return;
  }
  try {
    const rows = await new PpgpsClient(GPS).getTrackers();
    let valid = 0, invalid = 0;
    const times = [];
    for (const row of rows) {
      const vehicle = fleet.find(item => item.imei === String(row?.imei));
      if (!vehicle) continue;
      try {
        times.push(normalizeTracker(row, vehicle, Date.now(), GPS.speedUnit).lastGpsAt);
        valid++;
      } catch { invalid++; }
    }
    console.log(JSON.stringify({ rows: rows.length, matchedValidVehicles: valid, invalidVehicles: invalid,
      newestGpsAt: times.length ? new Date(Math.max(...times.map(Number))).toISOString() : null,
      note: 'Read-only check; no database writes. Coordinates and credentials are omitted.' }, null, 2));
    if (!valid || invalid) process.exitCode = 1;
  } catch (error) {
    console.error(`GPS check failed: ${error.code || 'connection_error'}`);
    process.exitCode = 1;
  }
})();
