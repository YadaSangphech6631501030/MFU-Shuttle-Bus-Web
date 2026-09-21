// Server-only Realtime publisher. No database migration or browser secret is needed.
function createBusPublisher({
  url = process.env.SUPABASE_URL,
  secret = process.env.SUPABASE_SECRET_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
  topic = 'mfu-buses',
  event = 'buses.updated',
} = {}) {
  let endpoint;
  try {
    const base = new URL(url);
    if (base.protocol === 'https:' && secret?.trim().startsWith('sb_secret_')) {
      endpoint = new URL(`/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${encodeURIComponent(event)}?private=true`, base);
    }
  } catch { /* Missing configuration keeps the existing API working. */ }
  let busy = false;
  let lastSuccessAt = null;
  let lastError = null;

  return {
    status() {
      return { configured: Boolean(endpoint), busy, lastSuccessAt, lastError };
    },
    async publishSnapshot(loadBuses) {
      if (!endpoint) return { ok: false, reason: 'unconfigured' };
      // Never accumulate a queue of obsolete GPS snapshots during an outage.
      if (busy) return { ok: false, reason: 'busy' };
      busy = true;
      try {
        const data = await loadBuses();
        // Array support is retained for the isolated connection-check script.
        const payload = Array.isArray(data)
          ? { schemaVersion: 1, sentAt: new Date().toISOString(), buses: data }
          : data;
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: { apikey: secret.trim(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
        // Never include response bodies or credentials in errors/logs.
        await response.body?.cancel();
        if (!response.ok) {
          lastError = `http_${response.status}`;
          return { ok: false, reason: lastError };
        }
        lastSuccessAt = new Date().toISOString();
        lastError = null;
        return { ok: true };
      } catch {
        lastError = 'publish_failed';
        return { ok: false, reason: lastError };
      } finally {
        busy = false;
      }
    },
  };
}

module.exports = { createBusPublisher };
