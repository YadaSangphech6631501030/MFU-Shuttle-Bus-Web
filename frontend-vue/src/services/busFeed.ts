import type { SupabaseClient } from '@supabase/supabase-js'

export type BusSnapshot<T> = {
  schemaVersion: 1
  streamId: string
  sequence: number
  capturedAt: string
  buses: T[]
}

type Options<T> = {
  client: SupabaseClient | null
  loadSnapshot: (signal: AbortSignal) => Promise<unknown>
  onBuses: (buses: T[]) => void
  onError?: () => void
  onPublicUpdate?: (payload: unknown) => void
  onConnectionChange?: (connected: boolean) => void
  now?: () => number
  schedule?: (callback: () => void, ms: number) => () => void
}

export function isBusSnapshot<T>(value: unknown): value is BusSnapshot<T> {
  if (!value || typeof value !== 'object') return false
  const data = value as BusSnapshot<unknown>
  return data.schemaVersion === 1 && typeof data.streamId === 'string' && data.streamId.length > 0
    && Number.isSafeInteger(data.sequence) && data.sequence > 0
    && typeof data.capturedAt === 'string' && Number.isFinite(Date.parse(data.capturedAt))
    && Array.isArray(data.buses) && data.buses.length <= 1000
    && data.buses.every(bus => {
      if (!bus || typeof bus !== 'object') return false
      const row = bus as Record<string, unknown>
      return typeof row.busId === 'string'
        && (row.lat === null || (typeof row.lat === 'number' && Number.isFinite(row.lat) && Math.abs(row.lat) <= 90))
        && (row.lng === null || (typeof row.lng === 'number' && Number.isFinite(row.lng) && Math.abs(row.lng) <= 180))
    })
}

// Both apps use the same protocol. HTTP establishes the current server instance;
// monotonically increasing sequence numbers prevent slow GETs from rewinding GPS.
export function startBusFeed<T>(options: Options<T>) {
  const now = options.now ?? Date.now
  let stopped = false
  let connected = false
  let lastEventAt: number | null = null
  let lastSnapshot: BusSnapshot<T> | null = null
  let pending: BusSnapshot<T> | null = null
  let active: Promise<void> | null = null
  let resyncNeeded = false
  const retired = new Set<string>()
  const controller = new AbortController()

  function deliver(snapshot: BusSnapshot<T>) {
    if (stopped) return
    if (lastSnapshot?.streamId === snapshot.streamId && lastSnapshot.sequence >= snapshot.sequence) return
    lastSnapshot = snapshot
    options.onBuses(snapshot.buses)
  }

  function refresh(): Promise<void> {
    if (stopped) return Promise.resolve()
    if (active) return active
    const atStart = lastSnapshot
    active = (async () => {
      try {
        const snapshot = await options.loadSnapshot(AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]))
        if (stopped) return
        if (!isBusSnapshot<T>(snapshot)) throw new Error('Invalid bus snapshot')
        if (retired.has(snapshot.streamId)) return
        if (lastSnapshot && lastSnapshot.streamId !== snapshot.streamId) {
          retired.add(lastSnapshot.streamId)
        }
        deliver(snapshot)
        if (pending?.streamId === snapshot.streamId) {
          deliver(pending)
          pending = null
          resyncNeeded = false
        }
      } catch {
        if (!stopped && lastSnapshot === atStart) options.onError?.()
      }
    })().finally(() => {
      active = null
      if (resyncNeeded && !stopped) {
        resyncNeeded = false
        void refresh()
      }
    })
    return active
  }

  const channel = options.client?.channel('mfu-buses', { config: { private: true } })
  if (options.onPublicUpdate) channel?.on('broadcast', { event: 'public.updated' }, ({ payload }) => {
    if (!stopped) options.onPublicUpdate?.(payload)
  })
  channel?.on('broadcast', { event: 'buses.updated' }, ({ payload }) => {
      if (stopped || !isBusSnapshot<T>(payload) || retired.has(payload.streamId)) return
      lastEventAt = now()
      if (lastSnapshot?.streamId === payload.streamId) {
        deliver(payload)
      } else {
        if (!pending || pending.streamId !== payload.streamId || pending.sequence < payload.sequence) pending = payload
        if (active) resyncNeeded = true
        else void refresh()
      }
    })
    .subscribe(status => {
      if (stopped) return
      connected = status === 'SUBSCRIBED'
      options.onConnectionChange?.(connected)
      if (connected) {
        // Fill gaps on the initial join and every subsequent reconnect.
        if (active) resyncNeeded = true
        else void refresh()
      } else {
        lastEventAt = null
        void refresh()
      }
    })

  const schedule = options.schedule ?? ((callback, ms) => {
    const timer = setInterval(callback, ms)
    return () => clearInterval(timer)
  })
  const cancelTimer = schedule(() => {
    if (!connected || lastEventAt === null || now() - lastEventAt > 15000) void refresh()
  }, 5000)
  void refresh()

  return {
    refresh,
    stop() {
      if (stopped) return
      stopped = true
      controller.abort()
      cancelTimer()
      if (channel) void options.client?.removeChannel(channel)
    },
  }
}
