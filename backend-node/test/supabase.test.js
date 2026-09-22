const test = require('node:test');
const assert = require('node:assert/strict');
const { createBusPublisher } = require('../services/supabase');

const config = { url: 'https://example.supabase.co', secret: 'sb_secret_test' };

test('crowd deltas use a separate event on the existing private channel', async () => {
  const payload = { schemaVersion: 1, stations: [{ id: 'a', waiting: 3 }] };
  const publisher = createBusPublisher({ ...config, event: 'public.updated', fetchImpl: async (url, options) => {
    assert.equal(url.pathname, '/realtime/v1/api/broadcast/mfu-buses/events/public.updated');
    assert.equal(url.searchParams.get('private'), 'true');
    assert.deepEqual(JSON.parse(options.body), payload);
    return new Response(null, { status: 202 });
  } });
  assert.deepEqual(await publisher.publishSnapshot(() => payload), { ok: true });
});

test('sends one private snapshot with server credentials, without credentials in payload', async () => {
  const buses = [{ busId: 'MFU01', lat: 20, lng: 99 }];
  const publisher = createBusPublisher({ ...config, fetchImpl: async (url, options) => {
    assert.equal(url.searchParams.get('private'), 'true');
    assert.equal(url.pathname, '/realtime/v1/api/broadcast/mfu-buses/events/buses.updated');
    assert.equal(options.headers.apikey, config.secret);
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body).buses, buses);
    assert.ok(!options.body.includes(config.secret));
    return new Response(null, { status: 202 });
  } });
  assert.deepEqual(await publisher.publishSnapshot(async () => buses), { ok: true });
  assert.ok(publisher.status().lastSuccessAt);
});

test('missing configuration does not load data or make a request', async () => {
  const publisher = createBusPublisher({ url: '', secret: '' });
  assert.deepEqual(await publisher.publishSnapshot(() => assert.fail()), { ok: false, reason: 'unconfigured' });
});

test('HTTP rejection and network failure are contained and later sends recover', async () => {
  let attempt = 0;
  const publisher = createBusPublisher({ ...config, fetchImpl: async () => {
    attempt++;
    if (attempt === 1) return new Response('sensitive response', { status: 401 });
    if (attempt === 2) throw new Error('sensitive network detail');
    return new Response(null, { status: 202 });
  } });
  assert.deepEqual(await publisher.publishSnapshot(async () => []), { ok: false, reason: 'http_401' });
  assert.deepEqual(await publisher.publishSnapshot(async () => []), { ok: false, reason: 'publish_failed' });
  assert.deepEqual(await publisher.publishSnapshot(async () => []), { ok: true });
  assert.equal(publisher.status().lastError, null);
});

test('overlapping notifications are dropped instead of building an obsolete queue', async () => {
  let release;
  const publisher = createBusPublisher({ ...config, fetchImpl: () => new Promise(resolve => { release = resolve; }) });
  const pending = publisher.publishSnapshot(async () => []);
  await Promise.resolve();
  assert.deepEqual(await publisher.publishSnapshot(() => assert.fail()), { ok: false, reason: 'busy' });
  release(new Response(null, { status: 202 }));
  await pending;
  assert.equal(publisher.status().busy, false);
});
