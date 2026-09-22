import test from 'node:test'
import assert from 'node:assert/strict'
import { startBusFeed as passengerFeed } from '../src/services/busFeed.ts'
import { startBusFeed as adminFeed } from '../../admin-web/src/services/busFeed.ts'

const flush = () => new Promise(resolve => setImmediate(resolve))

test('passenger multiplexes crowd and GPS events on one channel without cross-delivery', async () => {
  const events = new Map(), crowds = [], buses = [], statuses = []
  let status, channels = 0, removed = 0
  const channel = { on(_type, filter, callback) { events.set(filter.event, callback); return this },
    subscribe(callback) { status = callback; return this } }
  const feed = passengerFeed({ client: { channel() { channels++; return channel }, async removeChannel() { removed++ } },
    loadSnapshot: async () => snapshot(1), onBuses: rows => buses.push(rows),
    onPublicUpdate: payload => crowds.push(payload), onConnectionChange: value => statuses.push(value),
    schedule() { return () => {} } })
  await flush()
  events.get('public.updated')({ payload: { count: 3 } })
  events.get('buses.updated')({ payload: snapshot(2) })
  status('SUBSCRIBED'); await flush()
  assert.equal(channels, 1); assert.deepEqual(crowds, [{ count: 3 }]); assert.equal(buses.at(-1)[0].lat, 2)
  assert.deepEqual(statuses, [true]); feed.stop()
  events.get('public.updated')({ payload: { count: 9 } })
  assert.equal(crowds.length, 1); assert.equal(removed, 1)
})
const snapshot = (sequence, streamId = 'a') => ({
  schemaVersion: 1, streamId, sequence, capturedAt: new Date().toISOString(),
  buses: [{ busId: 'MFU01', lat: sequence, lng: 99 }],
})
function harness(start, load) {
  let onEvent, onStatus, tick
  let clock = 100000, stopped = false, removed = false
  const delivered = []
  let errors = 0
  const channel = {
    on(_type, _filter, cb) { onEvent = cb; return this },
    subscribe(cb) { onStatus = cb; return this },
  }
  const client = {
    channel(topic, options) { assert.equal(topic, 'mfu-buses'); assert.equal(options.config.private, true); return channel },
    async removeChannel() { removed = true },
  }
  const feed = start({ client, loadSnapshot: load, onBuses: rows => delivered.push(rows[0]?.lat),
    onError: () => { errors++ }, now: () => clock,
    schedule(cb) { tick = cb; return () => { stopped = true } },
  })
  return { feed, delivered, event: value => onEvent({ payload: value }), status: value => onStatus(value),
    tick: () => tick(), advance: ms => { clock += ms }, errors: () => errors,
    closed: () => stopped && removed }
}

for (const [name, start] of [['passenger', passengerFeed], ['admin', adminFeed]]) {
  test(`${name}: buffers an event racing the first snapshot and rejects out-of-order data`, async () => {
    let resolve
    const h = harness(start, () => new Promise(r => { resolve = r }))
    h.event(snapshot(3))
    resolve(snapshot(1))
    await flush()
    assert.deepEqual(h.delivered, [1, 3])
    h.event(snapshot(2))
    h.event({ schemaVersion: 1, buses: 'invalid' })
    assert.deepEqual(h.delivered, [1, 3])
    h.feed.stop()
  })
  test(`${name}: live events suppress polling, silence falls back and reconnect reloads`, async () => {
    let calls = 0
    const h = harness(start, async () => { calls++; return snapshot(calls) })
    await flush()
    h.status('SUBSCRIBED')
    await flush()
    h.event(snapshot(4))
    const before = calls
    h.tick()
    await flush()
    assert.equal(calls, before)
    h.advance(16000)
    h.tick()
    await flush()
    assert.equal(calls, before + 1)
    h.status('CHANNEL_ERROR')
    await flush()
    h.status('SUBSCRIBED')
    await flush()
    assert.equal(calls, before + 3)
    h.feed.stop()
    assert.equal(h.closed(), true)
  })
  test(`${name}: a late GET or failure cannot overwrite newer live data`, async () => {
    let resolve, reject
    let calls = 0
    const h = harness(start, () => ++calls === 1 ? Promise.resolve(snapshot(1)) : new Promise((r, j) => { resolve = r; reject = j }))
    await flush()
    void h.feed.refresh()
    h.event(snapshot(5))
    resolve(snapshot(2))
    await flush()
    assert.deepEqual(h.delivered, [1, 5])
    void h.feed.refresh()
    h.event(snapshot(6))
    reject(new Error('network offline'))
    await flush()
    assert.equal(h.errors(), 0)
    h.feed.stop()
  })
  test(`${name}: server restarts reconcile through HTTP and retired streams stay rejected`, async () => {
    let current = snapshot(5)
    const h = harness(start, async () => current)
    await flush()
    current = snapshot(1, 'b')
    h.event(snapshot(2, 'b'))
    await flush()
    assert.deepEqual(h.delivered, [5, 1, 2])
    h.event(snapshot(9, 'a'))
    assert.deepEqual(h.delivered, [5, 1, 2])
    h.feed.stop()
  })
  test(`${name}: stopping ignores an in-flight response`, async () => {
    let resolve
    const h = harness(start, () => new Promise(r => { resolve = r }))
    h.feed.stop()
    resolve(snapshot(1))
    await flush()
    assert.deepEqual(h.delivered, [])
    assert.equal(h.closed(), true)
  })
  test(`${name}: works with API fallback when Supabase is not configured`, async () => {
    let tick, calls = 0
    const feed = start({ client: null, loadSnapshot: async () => { calls++; return snapshot(calls) },
      onBuses() {}, schedule(cb) { tick = cb; return () => {} } })
    await flush()
    tick()
    await flush()
    assert.equal(calls, 2)
    feed.stop()
  })
}
