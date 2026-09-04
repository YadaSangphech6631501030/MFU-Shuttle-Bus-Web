# Agent And System Architecture: MFU Shuttle Bus

เอกสารนี้อธิบาย architecture ของระบบและแนวทางให้ AI/agent อ่าน repo เพื่อพัฒนาต่ออย่างถูกต้อง

## 1. System Agents

ในโปรเจกต์นี้คำว่า agent หมายถึงส่วนที่ทำหน้าที่รับผิดชอบงานเฉพาะในระบบ

| Agent/System Part | Path | Responsibility |
|---|---|---|
| Passenger App | `frontend-vue/` | UI ผู้ใช้, map, route search, favorite, report/feedback |
| Admin Web | `admin-web/` | UI ผู้ดูแลระบบ, dashboard, station CRUD, users, CCTV, reports |
| Backend API | `backend-node/app.js`, `backend-node/routes/` | REST API, auth, validation, business logic |
| MongoDB | `shuttlebus_system` | เก็บ users, stations, buses, reports |
| Movement Engine | `backend-node/engines/movement.engine.js` | จำลอง bus status/currentStationIndex |
| Detector Service | `backend-node/services/detector.js`, `backend-node/python/detector.py` | CCTV/YOLO detection runtime |
| Docker Runtime | `docker-compose.yml`, `docker/` | Build/run services และ import demo data |
| Documentation Agent | `docs/` | เก็บ source truth สำหรับอาจารย์/AI |

## 2. Runtime Architecture

```text
Passenger Flutter App
  -> ApiService
  -> Backend Express API
  -> MongoDB

Admin Vue Web
  -> admin-web/src/services/api.ts
  -> Backend Express API
  -> MongoDB
  -> Detector Service

Docker Compose
  -> mongo
  -> backend
  -> admin-web
  -> optional flutter-web
```

## 3. Backend Request Flow

```text
HTTP Request
  -> backend-node/app.js
  -> route file in backend-node/routes/
  -> optional middleware jwt/admin
  -> MongoDB via getDB()
  -> JSON response
```

Mounted routes:

- `/auth` -> `backend-node/routes/auth.js`
- `/station` -> `backend-node/routes/station.js`
- `/api` -> `backend-node/routes/bus.routes.js`
- `/api` -> `backend-node/routes/report.routes.js`
- `/api` -> `backend-node/routes/detector.routes.js`

## 4. Frontend Request Flow

### Passenger App

```text
Flutter page
  -> frontend-vue/lib/services/api_service.dart
  -> Backend API
```

Important pages:

- `homepages.dart` controls Google Map, station search, trip route, bus markers
- `favorite_station.dart` controls favorite stations
- `report_page.dart` submits reports and feedback
- `signin01.dart` is a legacy loading/sign-in screen; current passenger entrypoint goes directly to `Homepages`

### Admin Web

```text
Vue page
  -> admin-web/src/services/api.ts
  -> Backend API
```

Important pages:

- `Dashboard.vue`
- `Stations.vue`
- `StationCCTV.vue`
- `Buses.vue`
- `Reports.vue`
- `Users.vue`

## 5. Security Boundary

| Boundary | Implementation |
|---|---|
| JWT verification | `backend-node/middleware/jwt.js` |
| Admin-only guard | `backend-node/middleware/admin.js` |
| JWT signing | `backend-node/routes/auth.js` with `SECRET_KEY`; ใช้กับ Admin Web เป็นหลัก |
| Admin Web token storage | `localStorage` keys `mfu_admin_token`, `mfu_admin_role` |
| Passenger App auth | Flutter passenger app เข้าใช้งานแบบ guest และไม่ต้องเก็บ token ใน workflow ปัจจุบัน |
| Detector stream token | `Authorization` header or `?token=` query |

Admin-only endpoints include station admin CRUD, admin user management, and detector operations.

## 6. Data Boundary

| Collection | Owner |
|---|---|
| `users` | Auth routes and Admin Users page; passenger reports are guest |
| `stations` | Station routes, Station Setting, Station CCTV, passenger station list |
| `buses` | Bus route and movement engine |
| `reports` | Report routes, passenger report page, Admin Reports page |

Full schema details are in `docs/data.md`.

## 7. AI Agent Workflow

When an AI agent changes this repo, follow this order:

1. Read `docs/projectmap.md`
2. Read the relevant source files listed in the project map
3. Check `docs/prd.md` for requirement impact
4. Check `docs/data.md` and `docs/er.md` for schema impact
5. Implement the smallest safe change
6. Run verification commands that match the touched area
7. Update docs if behavior, API, schema, deployment, or workflow changed
8. Summarize changed files and remaining risk

## 8. Source Truth Rules

Priority order:

| Priority | Source |
|---|---|
| 1 | Code that is actually imported/mounted |
| 2 | API wrappers used by UI |
| 3 | Seed/backup data |
| 4 | Tests and smoke commands |
| 5 | `docs/prd.md`, `docs/data.md`, `docs/er.md` |
| 6 | README/HANDBOOK/HANDOVER/DOCKER docs |

If documentation conflicts with mounted code, update documentation or record the mismatch as a known issue.

## 9. Verification By Area

| Area | Recommended command |
|---|---|
| Backend syntax | `cd backend-node && node --check app.js` |
| Backend runtime smoke | `curl http://localhost:5001/health` after server is running |
| Admin Web build | `cd admin-web && npm run build` |
| Flutter analysis | `cd frontend-vue && flutter analyze` |
| Docker config/build | `docker compose config`, then `docker compose up -d --build` |
| Docs-only changes | check links/paths with `rg` and read generated docs |

## 10. Known Architecture Notes

- `frontend-vue/` is a Flutter project, not Vue.
- Backend uses native MongoDB driver, not Mongoose, for mounted routes.
- `backend-node/controller/bus.controller.js` references a missing `models/bus.model` and is not mounted by `app.js`; use `backend-node/routes/bus.routes.js` as route truth.
- `reports` endpoints are currently public for list/update/delete; if this becomes production, add admin auth.
- `reports` backup JSON is currently empty; reports are created by app usage.
- Detector runtime writes frames under `backend-node/runtime/` or container runtime volume and should not be treated as source code.
