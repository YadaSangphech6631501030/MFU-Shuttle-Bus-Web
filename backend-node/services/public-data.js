const { createHash, randomUUID } = require('node:crypto');

// Shared per-process cache. Browser count does not multiply database polling.
// Geometry/metadata are versioned separately from frequently changing crowd rows.
function createPublicData({ loadCatalog, loadCrowds, publish = async () => {}, now = Date.now,
  streamId = randomUUID(), pollMs = 1000, catalogMaxAgeMs = 60000, heartbeatMs = 10000 }) {
  let catalog = null, snapshot = null, active = null, timer = null;
  let generation = 0, loadedGeneration = -1, catalogAt = -Infinity, refreshedAt = -Infinity;
  let lastPublishedAt = -Infinity, stopped = true;
  function invalidate() { generation++; }
  function refresh() {
    if (active) return active;
    active = (async () => {
      // If an admin write races a catalog read, discard that read and reload.
      do {
        const observed = generation;
        let nextCatalog = catalog, nextCatalogAt = catalogAt;
        if (!catalog || observed !== loadedGeneration || now() - catalogAt >= catalogMaxAgeMs) {
          const data = await loadCatalog();
          if (observed !== generation) continue;
          const version = createHash('sha256').update(JSON.stringify(data)).digest('hex');
          const routesVersion = createHash('sha256').update(JSON.stringify(data.routes)).digest('hex');
          nextCatalog = { version, routesVersion, ...data };
          nextCatalogAt = now();
        }
        const rows = await loadCrowds();
        if (observed !== generation) continue;
        const ids = new Set(nextCatalog.stations.map(station => station.id));
        const stations = rows.filter(row => ids.has(row.id));
        const previous = new Map(snapshot?.stations.map(row => [row.id, JSON.stringify(row)]) || []);
        const changed = stations.filter(row => previous.get(row.id) !== JSON.stringify(row));
        const catalogChanged = snapshot?.catalogVersion !== nextCatalog.version;
        const deleted = snapshot && snapshot.stations.some(row => !stations.some(next => next.id === row.id));
        const updated = !snapshot || catalogChanged || deleted || changed.length > 0;
        // Commit both parts together; HTTP must never see a new catalog paired
        // with counts from the previous version while a DB read is in flight.
        catalog = nextCatalog;
        catalogAt = nextCatalogAt;
        loadedGeneration = observed;
        snapshot = { schemaVersion: 1, streamId, sequence: (snapshot?.sequence || 0) + (updated ? 1 : 0),
          catalogVersion: catalog.version, capturedAt: new Date(now()).toISOString(), stations };
        refreshedAt = now();
        if (updated || now() - lastPublishedAt >= heartbeatMs) {
          lastPublishedAt = now();
          const { stations: _, ...header } = snapshot;
          // Full state comes from HTTP. Broadcast only changed counts/statuses,
          // plus a heartbeat to detect a lost final delta or a catalog change.
          const event = { ...header, kind: updated ? 'delta' : 'heartbeat', stations: updated ? changed : [] };
          void Promise.resolve().then(() => publish(event)).catch(() => {});
        }
        return snapshot;
      } while (true);
    })().finally(() => { active = null; });
    return active;
  }
  async function get(knownVersion, knownRoutesVersion) {
    if (!snapshot || loadedGeneration !== generation || now() - refreshedAt >= pollMs) await refresh();
    if (knownVersion === catalog.version) return { ...snapshot };
    const { routes, ...metadata } = catalog;
    return { ...snapshot, catalog: { ...metadata, ...(knownRoutesVersion === catalog.routesVersion ? {} : { routes }) } };
  }
  async function tick() {
    try { await refresh(); } catch { /* HTTP retries surface failure; retain the last good cache. */ }
    if (!stopped) { timer = setTimeout(tick, pollMs); timer.unref?.(); }
  }
  return { get, refresh, invalidate,
    start() { if (stopped) { stopped = false; void tick(); } },
    stop() { stopped = true; clearTimeout(timer); },
  };
}

module.exports = { createPublicData };
