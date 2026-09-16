const { randomUUID } = require('node:crypto');

// One MongoDB read per worker update, shared by every HTTP client.
function createBusSnapshots({ loadBuses, now = Date.now, streamId = randomUUID() }) {
  let current = null;
  let active = null;
  let sequence = 0;
  function refresh() {
    if (active) return active;
    active = Promise.resolve().then(loadBuses).then(buses => {
      current = { schemaVersion: 1, streamId, sequence: ++sequence,
        capturedAt: new Date(now()).toISOString(), buses };
      return current;
    }).finally(() => { active = null; });
    return active;
  }
  return {
    refresh,
    // Bound cache age if the worker is disabled, stalled, or backing off.
    get() { return !current || now() - Date.parse(current.capturedAt) >= 5000 ? refresh() : Promise.resolve(current); },
  };
}

module.exports = { createBusSnapshots };
