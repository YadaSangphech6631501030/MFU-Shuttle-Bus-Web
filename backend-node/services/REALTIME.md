# GPS Realtime publisher

คู่มือภาษาไทยสำหรับทีม: [docs/REALTIME.md](../../docs/REALTIME.md)
เครื่องใหม่เริ่มที่ [docs/HANDOVER.md](../../docs/HANDOVER.md)

`app.js` loads the root `.env`. Set `SUPABASE_URL` and a backend-only
`SUPABASE_SECRET_KEY` from Supabase API Keys, then restart Node.

After each GPS sync (including provider failures), `gps-runtime.js` sends the
public bus projection to the private `mfu-buses` topic with the `buses.updated`
event. Payload: `{ schemaVersion: 1, streamId, sequence, capturedAt, buses }`.
The stream ID changes on a backend restart; sequence increases within an instance.
`GET /api/buses/snapshot` shares a cached snapshot across clients (at most one
MongoDB read per five seconds unless the worker refreshes it). The old array
response of `GET /api/buses` remains supported.
The REST request times out after 10 seconds. Overlapping sends are dropped,
and the next completed GPS cycle attempts a fresh snapshot. GPS polling
and the existing API continue even when publishing fails.

Run `node backend-node/scripts/check-realtime.js` from the repository root
to send an empty test snapshot to a unique private test topic. `ok: true`
means Supabase accepted the request, not that a browser received it.
`http_401` indicates a rejected credential; copy the secret key value,
not its display name. No credentials or response bodies are printed.

Admins can inspect `realtime` in the existing authenticated
`GET /api/buses/gps-status` response for configuration, last success and
sanitized errors.

## Supabase setup (once)

Run `backend-node/sql/realtime.sql` in the project's SQL Editor. It grants
`anon` and `authenticated` receive access only to the bus topic and adds a
restrictive INSERT policy to deny browser sends on that topic. The browser
uses the publishable key and joins with `private: true`. These bus locations
are public passenger information; no Supabase Auth account is created and
the existing Node login remains unchanged. Do not add admin reports, cameras,
or user data to this channel.

In Realtime Settings, disable Allow public access if this project does not
need other public test channels. The application always uses the private
channel; public and private messages are separate.

## Browser behavior

Both apps load an HTTP snapshot initially and after each subscription/reconnect.
They apply actual bus payloads directly rather than fetching on every event.
Buffered events and sequence checks prevent a late initial GET from overwriting
newer updates. If events stop for 15 seconds, or Realtime is unavailable, HTTP
polling resumes every five seconds. Existing GPS age checks still govern ETA.
Returning to a visible tab or reconnecting the network also refreshes a snapshot.
Admin GPS diagnostics are fetched separately every 30 seconds; other non-bus
endpoints (stations, routes, reports, detector) keep their existing behavior.

Missing Supabase configuration falls back to HTTP. Set the `VITE_SUPABASE_*`
values in each web app's `.env`, and restart Vite after changing them. Docker
Compose forwards server values at runtime and browser values at build time;
rebuild images after changing browser environment variables.

This implementation assumes one GPS worker/backend instance per deployment.
Do not run independent GPS workers behind a load balancer without a shared
snapshot/version store and leader election. Supabase Free quotas still apply
to delivered messages and concurrent connections.

## Verification

```
node --test backend-node/test/bus-snapshots.test.js backend-node/test/gps.test.js backend-node/test/supabase.test.js
node --experimental-strip-types --test frontend-vue/test/busFeed.test.mjs
npm --prefix frontend-vue run build
npm --prefix admin-web run build
```

The TypeScript tests require Node with built-in type stripping (Node 22.6+).
In DevTools, inspect the WebSocket frames for `buses.updated`. The snapshot
GET should stop repeating while new events arrive. Disconnect/reconnect the
network and confirm recovery. Check that browser-originated sends on this
private channel return HTTP 403 while backend sends return 202.
