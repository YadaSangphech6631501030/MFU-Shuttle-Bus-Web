const { GPS } = require('../config');
const { getDB } = require('../db');
const { createGpsService } = require('./gps');
const { createBusPublisher } = require('./supabase');
const { createBusSnapshots } = require('./bus-snapshots');

const publisher = createBusPublisher();
const gps = createGpsService({
  config: GPS,
  getDB,
  onSync: async () => {
    const snapshot = await snapshots.refresh();
    void publisher.publishSnapshot(() => snapshot);
  },
});
const snapshots = createBusSnapshots({ loadBuses: () => gps.buses() });
gps.snapshot = () => snapshots.get();
gps.realtimeStatus = () => publisher.status();

module.exports = gps;
