# แผนที่โค้ด MFU Shuttle Bus Web

อัปเดต 18 กันยายน 2026 อ้างอิงไฟล์ที่ runtime ใช้งานจริง
เครื่องใหม่เริ่มที่ [HANDOVER.md](HANDOVER.md) และ [REALTIME.md](REALTIME.md)

## โครงสร้าง

```text
.env.example       แม่แบบเดียวสำหรับ root .env ที่ทุกส่วนใช้ร่วมกัน
backend-node/       Express, MongoDB, GPS worker, detector
admin-web/src/     Vue 3 สำหรับผู้ดูแลระบบ
frontend-vue/src/  Vue 3 สำหรับผู้โดยสาร
frontend-vue/assets/ รูปรถและ GeoJSON สำรอง
docker/            ข้อมูล demo และ MongoDB initialization
docs/              คู่มือระบบและส่งต่องาน
```

เว็บปัจจุบันเป็น Vue/Vite ให้พัฒนาใน `src/` ส่วนโค้ดเก่าที่ไม่ได้เชื่อมกับ runtime และไฟล์ซ้ำที่นำออกสามารถดูย้อนหลังใน Git

## Backend

| ไฟล์ | หน้าที่ |
|---|---|
| `backend-node/app.js` | เชื่อม DB, เริ่ม GPS และ mount routes |
| `backend-node/config.js` | โหลด root `.env` ให้ API, seed และ scripts; ค่า Node/MongoDB/GPS |
| `backend-node/db.js` | MongoDB connection และ initialize routes |
| `backend-node/services/gps.js` | อ่าน/validate GPS, บันทึก MongoDB, health และ public bus projection |
| `backend-node/config/gps-fleet.json` | จับคู่ device กับรถ/สาย |
| `backend-node/services/gps-runtime.js` | เชื่อม GPS กับ snapshot/publisher |
| `backend-node/services/bus-snapshots.js` | cache, stream ID และ sequence |
| `backend-node/services/supabase.js` | ส่ง private Broadcast โดยใช้ Secret key |
| `backend-node/sql/realtime.sql` | policy รับข้อมูลรถและห้าม client ส่ง |
| `backend-node/services/routes.js` | จัดการเส้นทางรถ |
| `backend-node/services/detector.js` | ควบคุม Python detector |
| `backend-node/python/detector.py` | YOLO/OpenCV และบันทึกจำนวนคน |
| `backend-node/python/yolov8s.pt` | โมเดล YOLO ที่ detector ใช้งาน |

| API | ไฟล์ route | ผู้ใช้ |
|---|---|---|
| `/auth` | `backend-node/routes/auth.js` | Node JWT, profile/admin management |
| `/station` | `backend-node/routes/station.js` | สถานีสาธารณะและ admin CRUD |
| `/api/buses`, `/api/buses/snapshot` | `backend-node/routes/bus.routes.js` | ข้อมูลรถสาธารณะ |
| `/api/buses/gps-status` | `backend-node/routes/bus.routes.js` | diagnostics เฉพาะ admin |
| `/api/routes` | `backend-node/routes/route.routes.js` | เส้นทางผู้โดยสารและการจัดการโดย admin |
| `/api/report` | `backend-node/routes/report.routes.js` | รายงาน/feedback |
| `/api/detector` | `backend-node/routes/detector.routes.js` | CCTV/detector |
| `/health` | `backend-node/app.js` | process health |

## Frontend ที่ทั้งสองเว็บมี

| ไฟล์ภายใต้แต่ละเว็บ | หน้าที่ |
|---|---|
| `src/main.ts` | Vue bootstrap |
| `src/App.vue` | state และการเชื่อม UI กับข้อมูล |
| `src/services/api.ts` | REST wrapper, session, snapshot GET |
| `src/services/supabase.ts` | client จาก Publishable key; ไม่มี config ก็ fallback ได้ |
| `src/services/busFeed.ts` | subscribe, buffering, ordering, reconnect, HTTP fallback |
| `src/styles.css` | รูปแบบหน้าเว็บ |

`busFeed.ts` มีสองสำเนาที่ต้องแก้ให้ตรงกัน การทดสอบ `frontend-vue/test/busFeed.test.mjs` ตรวจทั้งคู่
`vite.config.ts` ของแต่ละเว็บกำหนด `envDir` ไปที่ root เพื่ออ่าน `.env` ร่วมกัน

## ผู้โดยสาร

| ไฟล์ | หน้าที่ |
|---|---|
| `frontend-vue/src/App.vue` | Google Map, หมุดรถ/สถานี, From/To, TH/EN และ popups |
| `frontend-vue/src/arrival.ts` | รถที่กำลังจะถึงสถานีและ ETA ตามเส้นทาง |
| `frontend-vue/src/arrivalDisplay.ts` | ข้อความเวลาถึง/สาเหตุที่ยังไม่มี ETA |
| `frontend-vue/src/liveGps.ts` | อายุ GPS, การเคลื่อนหมุดและเงื่อนไข ETA |
| `frontend-vue/src/gpsMotion.ts` | ประเมิน speed/heading จาก GPS สองจุดเมื่อจำเป็น |
| `frontend-vue/src/routePlanning.ts` | ค้นหาเส้นทางและจุดขึ้นรถ |
| `frontend-vue/src/pages/TransitPage.vue` | รายการสาย/สถานี |
| `frontend-vue/src/pages/FavoritesPage.vue` | สถานีโปรด |
| `frontend-vue/src/pages/FeedbackPage.vue` | รายงานและ feedback |
| `frontend-vue/src/pages/SettingsPage.vue` | การตั้งค่า |

## แอดมิน

หน้า UI อยู่ใน `admin-web/src/page/`: `Dashboard.vue`, `Stations.vue`, `StationCCTV.vue`,
`Buses.vue`, `Routes.vue`, `Reports.vue`, `Users.vue`
state ส่วนกลางและ timers ส่วนใหญ่อยู่ที่ `admin-web/src/App.vue`; types อยู่ `src/types.ts`

## ทดสอบและเอกสาร

- `backend-node/test/config.test.js`: root env, การรันจากโฟลเดอร์อื่น และ environment overrides
- `backend-node/test/gps.test.js`: provider, GPS, API และ auth ของ diagnostics
- `backend-node/test/bus-snapshots.test.js`: shared cache และ version
- `backend-node/test/supabase.test.js`: ตัวส่ง, failure recovery และ overlapping sends
- `frontend-vue/test/busFeed.test.mjs`: ตัวรับทั้งสองเว็บและ reconnect/order
- `frontend-vue/test/arrival.test.mjs`, `liveGps.test.mjs`, `routePlanning.test.mjs`: ETA/เส้นทาง
- [HANDOVER.md](HANDOVER.md): เพื่อนรับงานเริ่มที่นี่
- [REALTIME.md](REALTIME.md): protocol, setup และ troubleshooting
- [GPS.md](GPS.md): provider และ freshness
- [HANDBOOK.md](HANDBOOK.md): วิธีใช้หน้าเว็บ
- [DOCKER.md](DOCKER.md): build/run containers
- [data.md](data.md), [er.md](er.md): ฐานข้อมูลและความสัมพันธ์

อย่าแก้ `node_modules`, `dist` หรือ `backend-node/runtime` เป็น source code และอย่า commit `.env`
