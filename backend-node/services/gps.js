const fleet = require('../config/gps-fleet.json');

class GpsError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Only this session cookie is retained. Never store the site's remembered password.
class PpgpsClient {
  constructor({ baseUrl, username, password, timeoutMs = 15000, fetchImpl = fetch }) {
    this.base = new URL(baseUrl);
    if (!['http:', 'https:'].includes(this.base.protocol) || this.base.username || this.base.password) {
      throw new GpsError('configuration_error');
    }
    this.username = username;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
    this.session = '';
  }

  async request(path, options = {}, redirects = 0) {
    const url = new URL(path, this.base);
    if (url.origin !== this.base.origin || redirects > 5) throw new GpsError('redirect_error');
    const headers = { ...options.headers };
    if (this.session) headers.Cookie = `PHPSESSID=${this.session}`;
    let response;
    try {
      response = await this.fetch(url, {
        ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const match = cookie.match(/^PHPSESSID=([^;]*)/i);
        if (match) this.session = match[1];
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new GpsError('redirect_error');
        const next = new URL(location, url);
        // Never forward credentials/session to a different host, including redirects.
        if (next.origin !== this.base.origin) throw new GpsError('redirect_error');
        const method = options.method || 'GET';
        const nextOptions = response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')
          ? {} : options;
        return this.request(next.href, nextOptions, redirects + 1);
      }
      if ([401, 403].includes(response.status)) {
        await response.body?.cancel();
        throw new GpsError('authentication_failed');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new GpsError('provider_error');
      }
      const chunks = [];
      let size = 0;
      if (response.body) {
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) throw new GpsError('invalid_response');
          chunks.push(Buffer.from(chunk));
        }
      }
      return Buffer.concat(chunks).toString('utf8');
    } catch (error) {
      // Do not expose fetch errors, request config, credentials or response bodies.
      if (error instanceof GpsError) throw error;
      throw new GpsError('connection_error');
    }
  }

  async login() {
    this.session = '';
    await this.request('/index.php');
    await this.request('/login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: this.base.origin, Referer: new URL('/index.php', this.base).href },
      body: new URLSearchParams({ username: this.username, password: this.password }).toString(),
    });
    if (!this.session) throw new GpsError('authentication_failed');
  }

  async readTrackers() {
    const body = await this.request('/api/getTracker.php');
    if (/<(?:html|form|input)\b/i.test(body) && /password|login\.php/i.test(body)) {
      throw new GpsError('authentication_failed');
    }
    let rows;
    try { rows = JSON.parse(body); } catch { throw new GpsError('invalid_response'); }
    if (!Array.isArray(rows)) throw new GpsError('invalid_response');
    return rows;
  }

  async getTrackers() {
    if (!this.session) {
      await this.login();
      try { return await this.readTrackers(); }
      catch (error) { if (error.code === 'authentication_failed') this.session = ''; throw error; }
    }
    try { return await this.readTrackers(); }
    catch (error) {
      if (error.code !== 'authentication_failed') throw error;
      await this.login();
      try { return await this.readTrackers(); }
      catch (retryError) { if (retryError.code === 'authentication_failed') this.session = ''; throw retryError; }
    }
  }
}

function numeric(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  if (typeof value === 'string' && !value.trim()) return NaN;
  return Number(value);
}

function normalizeTracker(row, vehicle, now, speedUnit = 'unknown') {
  const lat = numeric(row.lat), lng = numeric(row.lng), seconds = numeric(row.time);
  const speed = numeric(row.speed), direction = numeric(row.cardirection);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
      (lat === 0 && lng === 0) || !Number.isSafeInteger(seconds) || seconds < 946684800 || seconds * 1000 > now + 60000) {
    throw new GpsError('invalid_tracker');
  }
  const speedRaw = Number.isFinite(speed) && speed >= 0 ? speed : null;
  const factor = { kmh: 1, mph: 1.609344, knots: 1.852 }[speedUnit];
  return {
    source: 'ppgps', imei: vehicle.imei, providerId: String(row.id || ''), busId: vehicle.busId,
    lat, lng, speedRaw, speedUnit, speedKph: speedRaw !== null && factor ? speedRaw * factor : null,
    directionRaw: Number.isFinite(direction) ? direction : null,
    movement: speedRaw === null ? 'unknown' : speedRaw > 0 ? 'moving' : 'stopped',
    alarm: typeof row.alarm === 'string' ? row.alarm.slice(0, 200) : '',
    lastGpsAt: new Date(seconds * 1000), receivedAt: new Date(now),
  };
}

function createGpsService({ config, getDB, client, now = Date.now, vehicles = fleet }) {
  let state = config.enabled ? 'unconfigured' : 'disabled';
  let lastSuccessAt = null, lastAttemptAt = null, errorCode = null;
  let invalidCount = 0, unmappedCount = 0, timer = null, stopped = true, inFlight = null;
  const configured = Boolean(config.username && config.password);
  const registry = new Map(vehicles.map(vehicle => [vehicle.imei, vehicle]));
  let provider = client;

  function status() {
    const healthy = state === 'connected' && lastSuccessAt !== null &&
      now() - lastSuccessAt <= Math.max(config.pollMs * 3, config.timeoutMs * 2 + config.pollMs);
    return {
      state: state === 'connected' && !healthy ? 'connection_error' : state,
      healthy, configured, lastSuccessAt: lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null,
      lastAttemptAt: lastAttemptAt ? new Date(lastAttemptAt).toISOString() : null,
      errorCode, invalidCount, unmappedCount, pollMs: config.pollMs, staleAfterMs: config.staleMs,
    };
  }

  async function performSync() {
    if (!config.enabled || !configured) return status();
    lastAttemptAt = now();
    try {
      if (!provider) provider = new PpgpsClient(config);
      if (!lastSuccessAt) state = 'connecting';
      const rows = await provider.getTrackers();
      const accepted = new Map();
      invalidCount = 0; unmappedCount = 0;
      const timestamp = now();
      for (const row of rows) {
        if (!row || typeof row !== 'object') { invalidCount++; continue; }
        const vehicle = registry.get(String(row.imei));
        if (!vehicle) { unmappedCount++; continue; }
        try {
          const record = normalizeTracker(row, vehicle, timestamp, config.speedUnit);
          const prior = accepted.get(vehicle.imei);
          if (!prior || prior.lastGpsAt < record.lastGpsAt) accepted.set(vehicle.imei, record);
        } catch { invalidCount++; }
      }
      if (!accepted.size) throw new GpsError(rows.length ? 'invalid_data' : 'empty_data');
      const collection = getDB().collection('buses');
      for (const [imei, record] of accepted) {
        const id = `ppgps:${imei}`;
        const old = await collection.findOne({ _id: id });
        if (old?.lastGpsAt && new Date(old.lastGpsAt) > record.lastGpsAt) continue;
        await collection.updateOne({ _id: id }, { $set: record }, { upsert: true });
      }
      lastSuccessAt = now();
      state = invalidCount ? 'partial_data' : 'connected';
      errorCode = invalidCount ? 'invalid_tracker' : null;
    } catch (error) {
      state = error instanceof GpsError ? error.code : 'storage_error';
      errorCode = state;
    }
    return status();
  }

  function sync() {
    if (inFlight) return inFlight;
    inFlight = performSync().finally(() => { inFlight = null; });
    return inFlight;
  }

  async function tick() {
    await sync();
    if (!stopped) {
      const delay = state === 'authentication_failed' ? Math.max(300000, config.pollMs)
        : status().healthy ? config.pollMs : Math.max(30000, config.pollMs);
      timer = setTimeout(tick, delay);
      timer.unref?.();
    }
  }

  return {
    status, sync,
    start() { if (!stopped || !config.enabled || !configured) return; stopped = false; void tick(); },
    stop() { stopped = true; clearTimeout(timer); },
    async buses() {
      const saved = await getDB().collection('buses').find({ source: 'ppgps' }).toArray();
      const records = new Map(saved.map(row => [row.imei, row]));
      const feed = status();
      return vehicles.map(vehicle => {
        const row = records.get(vehicle.imei);
        const gpsMs = row?.lastGpsAt ? new Date(row.lastGpsAt).getTime() : NaN;
        const age = now() - gpsMs;
        const freshness = !Number.isFinite(age) || age < -60000 ? 'unknown' : age > config.staleMs ? 'stale' : 'fresh';
        const connectionStatus = feed.healthy ? freshness : 'unknown';
        return {
          busId: vehicle.busId, busNumber: vehicle.busId.replace(/^MFU/, ''), line: vehicle.line || null,
          source: 'ppgps', connectionStatus, freshness, feedHealthy: feed.healthy,
          status: row?.movement === 'moving' ? 'RUNNING' : row?.movement === 'stopped' ? 'STOPPED' : 'UNKNOWN',
          lat: row?.lat ?? null, lng: row?.lng ?? null, speedRaw: row?.speedRaw ?? null,
          speedUnit: row?.speedUnit || 'unknown', speedKph: row?.speedKph ?? null,
          alarm: row?.alarm || '', lastGpsAt: Number.isFinite(gpsMs) ? new Date(gpsMs).toISOString() : null,
          receivedAt: row?.receivedAt ? new Date(row.receivedAt).toISOString() : null,
        };
      });
    },
  };
}

module.exports = { PpgpsClient, GpsError, normalizeTracker, createGpsService };
