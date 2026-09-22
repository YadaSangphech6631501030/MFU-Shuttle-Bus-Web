# Automatic passenger routing

Passenger trip planning uses the ordered coordinates of each enabled route and the
current station list from the API. It has no station-ID allowlists, blocked pairs,
or fixed station count. Stations still need accurate coordinates and their service
lines (`lines`). Adding a station does not change where a bus drives: edit the route
geometry too if the new stop lies on a new road.

## Matching a station to the route

- Project the station onto polyline segments, rather than choosing the closest
  sampled vertex. Compute its cumulative distance from the start of the polyline.
- Reject a match more than 50 m from the route. Missing or invalid geometry cannot
  be replaced by joining stations in ID order.
- Preserve separate visits when a road occurs more than once in the polyline.
  Candidate segments within 2 m of the closest match are considered together.
- MFU uses left-hand traffic. For opposing passes of a shared road, use the curb
  to the left of the direction of travel. This relies on station markers being on
  their actual roadside; a lateral offset under 0.5 m is not decisive.
- If multiple visits remain ambiguous, do not silently choose the first one.
  Provide a per-line `routeBearings` hint through the station API. This optional
  metadata does not change the passenger or admin screen layout.

`routeBearings` contains the direction of bus travel at the stop in degrees
clockwise from north: 0 north, 90 east, 180 south, 270 west. Hints filter candidate
segments to headings within 60 degrees. They do not bypass distance or route
membership checks. Exact overlaps in the same direction can remain ambiguous and
require corrected route geometry or station placement.

Example request body for `PUT /station/admin/<station-id>` (admin authentication is
required; replace the route ID and bearing with the actual service direction):

```json
{
  "routeBearings": {
    "line1": 90,
    "line2": 90
  }
}
```

Omitting `routeBearings` on update preserves it. Sending `null` or `{}` clears it
and restores automatic matching. Review hints when changing a route's direction
or moving a stop. A station can use different bearings on different lines.

## Direction and loops

The sequence of coordinates defines the driving direction and the boundary of
one passenger run. Both open and closed drawings only allow destinations ahead of
the origin. Endpoints within 10 m are treated as meeting for station matching;
this does **not** mean passengers may stay aboard across the terminus into another
run. Neither direct rides nor alighting recommendations wrap from the final
coordinate to the first.

Both current campus polylines order their served stops from Lamduan 2 to Minimart
Lamduan. The bus ends each passenger run at Minimart. There are no station-ID
exceptions: adding, removing or renaming stations preserves the boundary in the
ordered geometry. Route edits must preserve the operational start/end order;
rotating the first coordinate of a closed drawing changes the run boundary.

Trips from F Parking or the hospital to Lamduan 2 therefore recommend alighting
at Lamduan Food Court, about 94 m straight-line from the destination, before the
terminus. Trips back to Lamduan 7 outbound recommend Lamduan 7 inbound, about
25 m away. Boarding at Minimart does not produce a ride into the next run.

In automatic selection, the passenger app prefers line 1 when both selected stops
are served by it and it supplies a ride or alighting recommendation. The direct
ride and alighting alternatives are compared within line 1, so a shorter line 2
branch does not suppress an opposite-side recommendation. For example, Lamduan 2
to E2 outbound recommends E2 inbound on line 1, about 4 m away.

If either endpoint requires another line (such as the medical center), or line 1
is unavailable, choose the shortest valid ride on the available services and keep
alighting recommendations on that service. Explicit line selection still restricts
planning to the selected line. This is a line preference, not a list of station IDs;
future exclusive stations and service lines are resolved from their API data.

## Alighting recommendations

Keep the selected origin and consider reachable stops within 500 m straight-line
distance of the selected destination. Rank bus distance along the polyline plus
walking proximity using the existing planning assumptions (8.33 m/s bus speed,
1.4 m/s walking speed). Keep a direct ride unless an alternative saves at least
60 estimated seconds, or no direct ride is available. These are planning
heuristics, not live GPS ETA or verified pedestrian crossing routes.

The map's bus path ends at the recommended alighting stop. Walking proximity is
displayed separately, rounded to the nearest metre. Lamduan 2 to M-Square still
recommends Oval Pond, about 21 m straight-line from M-Square.

## Nearby boarding recommendations

When neither a direct ride nor an alighting recommendation is available from the
selected origin, consider boarding stops within 500 m straight-line of that
origin. This fallback does not replace an existing trip or change the selections.
Candidate rides follow the same ordered polyline and passenger-run boundary as
normal trips. Rank walking to board, the bus ride, and any walk after alighting
using the same planning speeds. Keep line 1 as the preferred service for campus
destinations when it provides a useful candidate; respect explicit line filters.

Reject boarding at the selected destination, riding back to the selected origin,
and alternatives whose estimated ride-plus-walk time is no better than walking
directly. Walking estimates are straight-line proximity, not verified pedestrian
routes, and do not include live bus waiting time. No station-ID rules are needed.

For example, Minimart Lamduan to Lamduan 7 outbound recommends walking about 120 m
to Lamduan 2 and boarding line 1. The bus path starts at Lamduan 2, so it never
depicts riding past the previous run's terminus. Minimart to M-Square can recommend
both boarding at Lamduan 2 and alighting at Oval Pond, with separate 120 m and
21 m walking distances. Both recommendations use the existing summary card style.

## Data changes and checks

The passenger app loads a versioned catalog through `/api/public-data` and listens
for `public.updated` on the existing private Realtime channel. Station coordinates,
service lines, direction hints and route geometry trigger a new planner; crowd
counts, labels and colors update the current station views without rebuilding the
map or planner. HTTP fallback/reconnect requests omit unchanged geometry. Removing
a selected station clears that selection, including when all stations are removed.
There is no cached station-ID routing table to update. See [REALTIME.md](REALTIME.md)
for versioning, missed-message recovery and the shared backend cache.

Frontend tests cover new IDs/lines, insertion/deletion, coordinate and geometry
edits, sparse/dense polylines, overlapping roads, ambiguous matches, passenger-run
boundaries, off-route stops, and every served station pair on both bundled campus
routes, including automatic line selection and hospital-origin trips.
API tests cover creating, reading, updating, preserving and clearing direction
hints. Run:

```powershell
node --test --experimental-test-isolation=none frontend-vue/test/*.test.mjs backend-node/test/stationRouting.test.js
```

The database-backed API integration test uses an isolated temporary database:

```powershell
cd backend-node
node --test test/routes.test.js
```
