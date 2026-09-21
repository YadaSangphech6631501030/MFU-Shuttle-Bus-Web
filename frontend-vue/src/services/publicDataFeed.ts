import type { ShuttleRoute, Station } from './api.ts'

export type Crowd = Required<Pick<Station, 'id' | 'waiting' | 'status' | 'statusColor' | 'statusLabel'>>
export type Catalog = { version: string; routesVersion: string; stations: Station[]; routes: ShuttleRoute[] }
type State = { schemaVersion: 1; streamId: string; sequence: number; catalogVersion: string; capturedAt: string; stations: Crowd[] }
type Update = State & { kind: 'delta' | 'heartbeat' }
type Snapshot = State & { catalog?: Omit<Catalog, 'routes'> & { routes?: ShuttleRoute[] } }
type Options = {
  loadSnapshot: (catalogVersion: string | undefined, routesVersion: string | undefined, signal: AbortSignal) => Promise<unknown>
  onCatalog: (catalog: Catalog) => void
  onCrowds: (stations: Crowd[]) => void
  onError?: () => void
  now?: () => number
  random?: () => number
  schedule?: (callback: () => void, ms: number) => () => void
}

function validState(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false
  const data = value as State
  return data.schemaVersion === 1 && typeof data.streamId === 'string' && data.streamId.length > 0
    && Number.isSafeInteger(data.sequence) && data.sequence > 0
    && typeof data.catalogVersion === 'string' && /^[a-f0-9]{64}$/.test(data.catalogVersion)
    && typeof data.capturedAt === 'string' && Number.isFinite(Date.parse(data.capturedAt))
    && Array.isArray(data.stations) && data.stations.length <= 10000
    && new Set(data.stations.map(row => row?.id)).size === data.stations.length
    && data.stations.every(row => row && typeof row.id === 'string' && Number.isSafeInteger(row.waiting)
      && row.waiting >= 0 && typeof row.status === 'string' && /^#[a-f0-9]{6}$/i.test(row.statusColor)
      && typeof row.statusLabel === 'string')
}
function validCatalog(value: Snapshot['catalog']): value is NonNullable<Snapshot['catalog']> {
  return !!value && /^[a-f0-9]{64}$/.test(value.version) && /^[a-f0-9]{64}$/.test(value.routesVersion)
    && Array.isArray(value.stations) && new Set(value.stations.map(stop => stop?.id)).size === value.stations.length
    && value.stations.every(stop => stop && typeof stop.id === 'string' && typeof stop.name === 'string'
      && Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && Array.isArray(stop.lines))
    && (value.routes === undefined || (Array.isArray(value.routes) && value.routes.every(route => route
      && typeof route.id === 'string' && route.geometry?.type === 'LineString' && Array.isArray(route.geometry.coordinates))))
}

// Shares the bus channel, but has its own sequence and outage detection. A healthy
// GPS stream cannot hide a broken crowd stream. HTTP repairs missed deltas.
export function startPublicDataFeed(options: Options) {
  const now = options.now ?? Date.now, random = options.random ?? Math.random
  let state: State | null = null, catalog: Catalog | null = null
  let active: Promise<boolean> | null = null, stopped = false, connected = false, needsSync = true
  let lastEventAt = -Infinity, nextPollAt = 0, failures = 0
  let pending: Update[] = []
  const retired = new Set<string>()
  const controller = new AbortController()

  function apply(event: Update) {
    if (retired.has(event.streamId)) return true
    if (!state || !catalog || event.streamId !== state.streamId) return false
    if (event.sequence <= state.sequence) return true
    if (event.catalogVersion !== catalog.version) return false
    if (event.kind === 'heartbeat' || event.sequence !== state.sequence + 1
      || event.stations.some(row => !catalog!.stations.some(stop => stop.id === row.id))) return false
    state = { ...state, sequence: event.sequence, capturedAt: event.capturedAt }
    options.onCrowds(event.stations)
    return true
  }
  function flushPending() {
    const remaining: Update[] = []
    for (const event of pending) if (!apply(event)) remaining.push(event)
    pending = remaining
    needsSync = remaining.length > 0
  }
  function refresh(): Promise<boolean> {
    if (stopped) return Promise.resolve(false)
    if (active) return active
    active = (async () => {
      try {
        const value = await options.loadSnapshot(catalog?.version, catalog?.routesVersion,
          AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]))
        if (stopped) return false
        if (!validState(value)) throw new Error('Invalid public snapshot')
        const snapshot = value as Snapshot
        if (retired.has(snapshot.streamId)) return false
        // A response started before a newer delta must never roll the display back.
        if (!state || state.streamId !== snapshot.streamId || snapshot.sequence >= state.sequence) {
          let nextCatalog = catalog
          if (!catalog || snapshot.catalogVersion !== catalog.version) {
            if (!validCatalog(snapshot.catalog) || snapshot.catalog.version !== snapshot.catalogVersion) throw new Error('Missing catalog')
            const routes = snapshot.catalog.routes ?? (snapshot.catalog.routesVersion === catalog?.routesVersion ? catalog.routes : undefined)
            if (!routes) throw new Error('Missing route geometry')
            nextCatalog = { ...snapshot.catalog, routes }
          }
          if (!nextCatalog || snapshot.stations.length !== nextCatalog.stations.length
            || snapshot.stations.some(row => !nextCatalog!.stations.some(stop => stop.id === row.id))) throw new Error('Incomplete station snapshot')
          if (state && state.streamId !== snapshot.streamId) retired.add(state.streamId)
          state = snapshot
          if (nextCatalog !== catalog) { catalog = nextCatalog; options.onCatalog(catalog) }
          options.onCrowds(snapshot.stations)
        }
        failures = 0
        nextPollAt = now() + 15000 + random() * 3000
        flushPending()
        return true
      } catch {
        if (!stopped) {
          needsSync = true
          failures++
          nextPollAt = now() + Math.min(60000, 15000 * 2 ** Math.min(failures - 1, 2)) + random() * 3000
          options.onError?.()
        }
        return false
      }
    })().finally(() => {
      active = null
      // If deltas raced the snapshot, request the latest state once. A server
      // that remains behind is retried by the timer, not a tight request loop.
      if (needsSync && pending.length && !failures && !stopped) nextPollAt = Math.min(nextPollAt, now() + 1000 + random() * 1000)
    })
    return active
  }
  function receive(value: unknown) {
    if (stopped || !validState(value)) return
    const event = value as Update
    if (!['delta', 'heartbeat'].includes(event.kind) || (event.kind === 'heartbeat' && event.stations.length)) return
    if (retired.has(event.streamId)) return
    lastEventAt = now()
    if (apply(event)) return
    pending.push(event)
    if (pending.length > 100) pending = pending.slice(-100)
    needsSync = true
    if (!failures || now() >= nextPollAt) void refresh()
  }
  function connectionChanged(value: boolean) {
    if (stopped) return
    connected = value
    lastEventAt = -Infinity
    // Always recover on reconnect. Disconnects use the jittered fallback timer.
    if (value) void refresh()
  }
  const schedule = options.schedule ?? ((callback, ms) => { const timer = setInterval(callback, ms); return () => clearInterval(timer) })
  const cancel = schedule(() => {
    if (now() >= nextPollAt && (needsSync || !connected || now() - lastEventAt > 25000)) void refresh()
  }, 1000)
  return { refresh, receive, connectionChanged,
    stop() { stopped = true; controller.abort(); cancel(); pending = [] },
  }
}
