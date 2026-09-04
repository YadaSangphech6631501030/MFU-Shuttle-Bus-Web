# AI-WORKFLOW: MFU Shuttle Bus

อัปเดตจาก source repo `MFU-Shuttle-Bus` ณ วันที่ 08/07/2026

เอกสารนี้เป็น workflow สำหรับ AI/agents ที่ต้องช่วยอ่าน แก้ไข ทดสอบ หรืออัปเดตเอกสารในโปรเจกต์ MFU Shuttle Bus

## 1. Operating Principle

AI ต้องอ่าน source จริงก่อนตัดสินใจ ห้ามเดา path, API, field, permission หรือคำสั่งทดสอบ ถ้าเอกสารกับ source code ไม่ตรงกัน ให้ถือ source code ที่ถูก import/mounted จริงเป็นความจริงอันดับแรก แล้วอัปเดตเอกสารให้ตรง

## 2. Source Truth Order

| Priority | Source | Purpose |
|---|---|---|
| 1 | Source code ที่ถูก import/mounted จริง | behavior truth |
| 2 | API wrappers ของ UI | request/response truth |
| 3 | Seed/backup data | demo data และ database field truth |
| 4 | Tests, build scripts, smoke commands | verification truth |
| 5 | `docs/prd.md`, `docs/data.md`, `docs/er.md` | product/data documentation truth |
| 6 | `README.md`, `docs/HANDBOOK.md`, `docs/HANDOVER.md`, `docs/DOCKER.md` | usage/deployment truth |

## 3. Route And UI Truth

Backend route truth:

| Base path | Source file |
|---|---|
| `/auth` | `backend-node/routes/auth.js` |
| `/station` | `backend-node/routes/station.js` |
| `/api/buses` | `backend-node/routes/bus.routes.js` |
| `/api/report` | `backend-node/routes/report.routes.js` |
| `/api/detector` | `backend-node/routes/detector.routes.js` |
| `/health` | `backend-node/app.js` |

Frontend API truth:

| App | API wrapper |
|---|---|
| Flutter passenger app | `frontend-vue/lib/services/api_service.dart` |
| Admin Vue web | `admin-web/src/services/api.ts` |

Important UI files:

| Area | Files |
|---|---|
| Flutter home/map/route search | `frontend-vue/lib/user/homepages.dart` |
| Flutter reports/feedback | `frontend-vue/lib/user/report_page.dart` |
| Flutter station/favorite | `frontend-vue/lib/user/bus_station.dart`, `frontend-vue/lib/user/favorite_station.dart` |
| Admin dashboard | `admin-web/src/page/Dashboard.vue` |
| Admin station CRUD | `admin-web/src/page/Stations.vue` |
| Admin CCTV/detector | `admin-web/src/page/StationCCTV.vue` |
| Admin reports | `admin-web/src/page/Reports.vue` |
| Admin users | `admin-web/src/page/Users.vue` |

## 4. Required Source Discovery

Before implementation, read the relevant minimum set.

Backend/API change:

- `backend-node/app.js`
- target route in `backend-node/routes/`
- relevant middleware in `backend-node/middleware/`
- `backend-node/db.js` and `backend-node/config.js` if config/database behavior changes
- relevant seed/backup files if data shape changes

Admin Web change:

- `admin-web/src/services/api.ts`
- `admin-web/src/types.ts`
- target page under `admin-web/src/page/`
- related CSS in `admin-web/src/styles.css` if layout changes

Flutter app change:

- `frontend-vue/lib/services/api_service.dart` if API behavior changes
- target page under `frontend-vue/lib/user/`
- `frontend-vue/lib/services/language_service.dart` if text/language changes
- `frontend-vue/lib/services/route_asset_service.dart` and route assets if map route behavior changes

Docs/process change:

- `docs/projectmap.md`
- `docs/prd.md`
- `docs/agent.md`
- `docs/er.md`
- `docs/data.md`
- relevant usage/deployment docs

## 5. Development Rules

1. Keep changes scoped to the requested behavior.
2. Prefer existing style and libraries already used in the repo.
3. Do not edit generated folders such as `node_modules/`, `build/`, `.dart_tool/`, `runtime/`.
4. Do not commit real API keys, camera credentials, `.env`, or local machine secrets.
5. If changing API response fields, update both Admin Web and Flutter consumers if they use the endpoint.
6. If changing MongoDB fields, update `docs/data.md`, `docs/er.md`, seed files, backup JSON, and UI types when needed.
7. If changing route search or map behavior, update `docs/prd.md` if acceptance criteria changes.

## 6. Backend Pattern

Current backend uses:

- Node.js
- Express
- CommonJS modules
- Native MongoDB driver
- JWT + bcrypt

Mounted route files live in `backend-node/routes/` and use `getDB()` from `backend-node/db.js`.

Admin-only endpoints should use:

```js
const tokenRequired = require("../middleware/jwt");
const adminOnly = require("../middleware/admin");
```

Then apply middleware on routes that require admin access.

## 7. Frontend Pattern

### Flutter Passenger App

- Source lives under `frontend-vue/lib/`
- API calls go through `frontend-vue/lib/services/api_service.dart`
- Language text should go through `LanguageService.text(...)` where existing code uses it
- Map/route changes should preserve Google Maps behavior and route asset fallback

### Admin Web

- Source lives under `admin-web/src/`
- API calls go through `admin-web/src/services/api.ts`
- Shared domain types live in `admin-web/src/types.ts`
- Pages live under `admin-web/src/page/`

## 8. Testing Gate

Minimum verification by scope:

Backend syntax:

```bash
cd backend-node
node --check app.js
```

Admin Web build:

```bash
cd admin-web
npm run build
```

Flutter analysis:

```bash
cd frontend-vue
flutter analyze
```

Docker config/run:

```bash
docker compose config
docker compose up -d --build
```

Docs-only change:

- verify file paths with `rg`
- read changed markdown files
- no app build required unless documented behavior or command changed

If a command cannot run, final output must say which command failed or was skipped and why.

## 9. PRD And Docs Update Gate

Update `docs/prd.md` when any of these change:

- business requirement
- user workflow
- acceptance criteria
- API endpoint, request, response, error behavior
- UI behavior or permission visibility
- data schema, seed, index, migration, backup
- release/deployment behavior

Update `docs/data.md` and `docs/er.md` when MongoDB collections or relationships change.

Update `docs/projectmap.md` when files/folders or source truth paths change.

Update `docs/agent.md` when architecture, workflow, security boundary, or agent responsibility changes.

## 10. T1-T20 Change Note Format

For large implementation notes or handoff docs, use this structure:

| T | Section | Required content |
|---|---|---|
| T1 | Change Title | concise name, module, date |
| T2 | Requirement | user request and business goal |
| T3 | Source Evidence | repo files/routes/tests read before decision |
| T4 | Current Behavior | what source currently does |
| T5 | Impacted Agents | system parts affected and why |
| T6 | Scope | in scope, out of scope |
| T7 | Functional Requirements | FR IDs or requirement bullets |
| T8 | Acceptance Criteria | Given/When/Then or checklist |
| T9 | API Contract | endpoints, request, response, errors |
| T10 | Data Model / Migration | schema, seed, index, rollback |
| T11 | Backend Plan / Changes | routes, guards, services, tests |
| T12 | Frontend Plan / Changes | pages, API wrapper, state, UI |
| T13 | Security / Permission | auth, role, data privacy |
| T14 | Test Plan | test matrix and commands |
| T15 | Implementation Summary | files changed and behavior changed |
| T16 | Tests Run / Evidence | exact commands and results |
| T17 | PRD / Docs Updated | files changed or reason not needed |
| T18 | Risks / Blockers / Assumptions / Decisions | separated and owned |
| T19 | Release / Rollback | deploy, smoke, rollback, monitoring |
| T20 | Final Handoff | status, next owner, open items |

## 11. Done Criteria

A task is done only when:

- relevant source was read
- implementation follows current repo structure
- generated/cache files are not touched intentionally
- tests or verification are run when applicable
- docs update decision is recorded
- final summary lists changed files and remaining risks

## 12. Known Repo Notes

- `frontend-vue/` is Flutter, not Vue.
- Admin Web is Vue 3/Vite under `admin-web/`.
- Backend mounted routes use native MongoDB driver, not Mongoose.
- `backend-node/controller/bus.controller.js` references a missing model and is not mounted by `app.js`; do not use it as route truth.
- Runtime detector frames under `backend-node/runtime/` are generated data.
