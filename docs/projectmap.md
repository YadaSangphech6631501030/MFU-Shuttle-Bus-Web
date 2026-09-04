# Project Map: MFU Shuttle Bus

เอกสารนี้ใช้เป็นแผนที่โปรเจกต์สำหรับอาจารย์ ผู้ดูแลระบบ และ AI agent ที่ต้องอ่าน repo เพื่อหาบั๊กหรือพัฒนาต่อ

## 1. ภาพรวมโครงสร้าง

```text
MFU-Shuttle-Bus/
├── README.md
├── docker-compose.yml
├── backend-node/
├── admin-web/
├── frontend-vue/
├── docker/
└── docs/
```

| Path | หน้าที่ |
|---|---|
| `README.md` | ภาพรวมระบบ วิธี setup แบบ manual และรายการเอกสาร |
| `docker-compose.yml` | รวม service สำหรับ MongoDB, Backend, Admin Web และ Flutter Web profile |
| `backend-node/` | Backend API ด้วย Node.js, Express และ MongoDB |
| `admin-web/` | เว็บผู้ดูแลระบบด้วย Vue 3, TypeScript และ Vite |
| `frontend-vue/` | แอปผู้ใช้ด้วย Flutter แม้ชื่อโฟลเดอร์จะมีคำว่า vue |
| `docker/` | ข้อมูล import MongoDB และ backup ตัวอย่าง |
| `docs/` | เอกสารประกอบโปรเจกต์ทั้งหมด |

## 2. Backend Map

```text
backend-node/
├── app.js
├── config.js
├── db.js
├── routes/
├── middleware/
├── engines/
├── services/
├── seed/
├── python/
└── Dockerfile
```

| File/Folder | หน้าที่ |
|---|---|
| `backend-node/app.js` | จุดเริ่ม Express app, mount routes, เปิด `/health`, connect MongoDB และเริ่ม movement engine |
| `backend-node/config.js` | อ่านค่า `PORT`, `MONGO_URI`, `DB_NAME`, `SECRET_KEY`, `CAMERA_URL`, `SAVE_INTERVAL` |
| `backend-node/db.js` | สร้าง MongoDB client และ expose `connectDB()`, `getDB()` |
| `backend-node/routes/auth.js` | Admin login, JWT auth, profile endpoints และ admin user management |
| `backend-node/routes/station.js` | Public station by line และ admin station CRUD |
| `backend-node/routes/bus.routes.js` | อ่านข้อมูลรถที่ `/api/buses` |
| `backend-node/routes/report.routes.js` | สร้าง report/feedback, อ่านรายงาน, update status, delete |
| `backend-node/routes/detector.routes.js` | Start/stop/status/frame/stream ของ CCTV detector ต่อสถานี |
| `backend-node/middleware/jwt.js` | ตรวจ JWT จาก `Authorization: Bearer <token>` |
| `backend-node/middleware/admin.js` | จำกัด endpoint ที่ต้องเป็น `role: admin` |
| `backend-node/engines/movement.engine.js` | จำลองสถานะรถทุก 5 วินาที |
| `backend-node/services/detector.js` | ควบคุม process detector และ path frame runtime |
| `backend-node/python/detector.py` | Python detector ที่ใช้ YOLO/OpenCV |
| `backend-node/seed/seed_station.js` | seed สถานี 22 จุด และ index `id`, `lines` |
| `backend-node/seed/seed_bus.js` | seed รถตัวอย่าง 6 คัน |
| `backend-node/Dockerfile` | build backend image และ optional detector dependency |

### Backend Route Truth

| Base path | Source file | ใช้โดย |
|---|---|---|
| `/auth` | `backend-node/routes/auth.js` | Admin Web; Flutter passenger app ไม่ใช้ login ใน workflow ปัจจุบัน |
| `/station` | `backend-node/routes/station.js` | Flutter app, Admin Web |
| `/api/buses` | `backend-node/routes/bus.routes.js` | Flutter app, Admin Web |
| `/api/report` | `backend-node/routes/report.routes.js` | Flutter app, Admin Web |
| `/api/detector` | `backend-node/routes/detector.routes.js` | Admin Web |
| `/health` | `backend-node/app.js` | Docker health/smoke check |

## 3. Admin Web Map

```text
admin-web/
├── src/
│   ├── App.vue
│   ├── main.ts
│   ├── services/api.ts
│   ├── types.ts
│   └── page/
├── Dockerfile
├── nginx.conf
├── package.json
└── vite.config.ts
```

| File/Folder | หน้าที่ |
|---|---|
| `admin-web/src/App.vue` | Shell หลักของ Admin Web |
| `admin-web/src/main.ts` | Vue app bootstrap |
| `admin-web/src/services/api.ts` | API wrapper และ token storage สำหรับ admin |
| `admin-web/src/types.ts` | TypeScript types ของ station, bus, report, user, detector |
| `admin-web/src/page/Dashboard.vue` | Dashboard ภาพรวม, station map, crowd alerts |
| `admin-web/src/page/Stations.vue` | เพิ่ม แก้ ลบสถานี |
| `admin-web/src/page/StationCCTV.vue` | จัดการ CCTV/detector ต่อสถานี |
| `admin-web/src/page/Buses.vue` | ดูสถานะรถ |
| `admin-web/src/page/Reports.vue` | ดู report, feedback, history และเปลี่ยนสถานะ |
| `admin-web/src/page/Users.vue` | จัดการ admin/user |
| `admin-web/Dockerfile` | build static web แล้ว serve ด้วย Nginx |

## 4. Flutter App Map

```text
frontend-vue/
├── lib/
│   ├── main.dart
│   ├── services/
│   └── user/
├── assets/
│   └── routes/
├── pubspec.yaml
├── Dockerfile
└── nginx.conf
```

| File/Folder | หน้าที่ |
|---|---|
| `frontend-vue/lib/main.dart` | Flutter entrypoint เข้า `Homepages` โดยไม่ต้อง login |
| `frontend-vue/lib/services/api_service.dart` | เรียก backend API สำหรับ station, bus, report และมี auth helper เก่าที่ยังไม่ใช้ใน passenger workflow ปัจจุบัน |
| `frontend-vue/lib/services/language_service.dart` | จัดการภาษา EN/TH |
| `frontend-vue/lib/services/route_asset_service.dart` | โหลด GeoJSON route asset |
| `frontend-vue/lib/user/homepages.dart` | หน้า Home, Google Map, From/To search, route display, bus markers |
| `frontend-vue/lib/user/bus_controller.dart` | จำลองตำแหน่ง/ทิศทางรถบน route |
| `frontend-vue/lib/user/bus_station.dart` | รายการสถานี |
| `frontend-vue/lib/user/favorite_station.dart` | บันทึกสถานีโปรด |
| `frontend-vue/lib/user/report_page.dart` | ส่ง report และ feedback |
| `frontend-vue/lib/user/signin01.dart` | legacy loading/sign-in screen; ไม่ใช่หน้าเริ่มต้นของ passenger app ปัจจุบัน |
| `frontend-vue/lib/user/user_setting.dart` | เมนู setting/user navigation |
| `frontend-vue/assets/routes/polyline_line1_mfu.geojson` | เส้นทางสาย 1 |
| `frontend-vue/assets/routes/polyline_line2_mfu.geojson` | เส้นทางสาย 2 |
| `frontend-vue/Dockerfile` | build Flutter Web สำหรับ Docker profile |

## 5. Docker And Data Map

| Path | หน้าที่ |
|---|---|
| `docker-compose.yml` | service orchestration |
| `docker/mongo-init/001-import-backup.sh` | import backup เข้า MongoDB ตอนสร้าง volume ใหม่ |
| `docker/mongo-init/backup/shuttlebus_system.stations.json` | backup stations |
| `docker/mongo-init/backup/shuttlebus_system.buses.json` | backup buses |
| `docker/mongo-init/backup/shuttlebus_system.users.json` | backup users และ admin demo |
| `docker/mongo-init/backup/shuttlebus_system.reports.json` | backup reports ปัจจุบันว่าง |

## 6. Documentation Map

| File | จุดประสงค์ |
|---|---|
| `docs/projectmap.md` | แผนที่ repo และ source truth |
| `docs/prd.md` | Product Requirements Document |
| `docs/agent.md` | System/agent architecture และ workflow สำหรับ AI |
| `docs/er.md` | ER/data relationship ของ MongoDB collections |
| `docs/data.md` | Data dictionary, indexes, seed, backup |
| `docs/HANDBOOK.md` | คู่มือ user/admin/operator |
| `docs/HANDOVER.md` | Checklist ส่งมอบและสอบระบบ |
| `docs/DOCKER.md` | วิธี build/run ด้วย Docker |
| `docs/AI-WORKFLOW.md` | กติกาการให้ AI/agent ทำงานกับ repo นี้ |

## 7. Files To Avoid Editing Directly

| Path | เหตุผล |
|---|---|
| `node_modules/` | dependency generated |
| `frontend-vue/.dart_tool/` | Flutter generated cache |
| `frontend-vue/build/` | build output |
| `admin-web/dist/` | build output ถ้ามี |
| `backend-node/runtime/` | runtime frame/output จาก detector |
| `.env` และ config ที่มี key จริง | มี secret/API key |

## 8. Common Debug Starting Points

| อาการ | เริ่มดูที่ |
|---|---|
| Backend เปิดไม่ได้ | `backend-node/app.js`, `backend-node/config.js`, `backend-node/db.js` |
| MongoDB ไม่มีข้อมูล | `docker/mongo-init/001-import-backup.sh`, `backend-node/seed/` |
| Admin login ไม่ได้ | `backend-node/routes/auth.js`, `admin-web/src/services/api.ts` |
| Admin station CRUD มีปัญหา | `backend-node/routes/station.js`, `admin-web/src/page/Stations.vue` |
| Flutter map/route ไม่ขึ้น | `frontend-vue/lib/user/homepages.dart`, `frontend-vue/lib/services/route_asset_service.dart` |
| From/To route เลือกไม่ได้ | `frontend-vue/lib/user/homepages.dart` |
| Report ไม่ขึ้นใน admin | `frontend-vue/lib/user/report_page.dart`, `backend-node/routes/report.routes.js`, `admin-web/src/page/Reports.vue` |
| CCTV detector ใช้ไม่ได้ | `backend-node/routes/detector.routes.js`, `backend-node/services/detector.js`, `backend-node/python/detector.py` |
