# Product Requirements Document: MFU Shuttle Bus

## 1. Product Summary

MFU Shuttle Bus เป็นระบบติดตามและจัดการรถรับส่งภายในมหาวิทยาลัยแม่ฟ้าหลวง ประกอบด้วยแอปผู้ใช้, เว็บผู้ดูแลระบบ, Backend API และ MongoDB

เป้าหมายหลักคือให้ผู้ใช้ทั่วไปเข้าแอปได้ทันทีแบบไม่ต้อง login เพื่อดูสถานี เลือกต้นทาง/ปลายทาง ดูเส้นทางรถ ส่งรายงานปัญหา/feedback และให้ผู้ดูแลระบบ login ผ่าน Admin Web เพื่อจัดการสถานี รถ รายงาน บัญชีผู้ดูแล/ผู้ใช้ระบบ และ CCTV detector ได้

## 2. Stakeholders

| กลุ่มผู้ใช้ | ความต้องการ |
|---|---|
| ผู้โดยสาร/นักศึกษา | เข้าใช้แอปแบบ guest ค้นหาสถานี ดูเส้นทาง ดูรถใกล้สถานี บันทึกสถานีโปรด ส่งรายงานปัญหา |
| ผู้ดูแลระบบ | Login เข้า Admin Web ดู dashboard จัดการสถานี ตรวจรายงาน ดู feedback ดูสถานะรถ จัดการบัญชี |
| ผู้ดูแล deployment | รันระบบด้วย manual setup หรือ Docker และตรวจสอบ health |
| อาจารย์/กรรมการสอบ | ตรวจโครงสร้างระบบ requirement database deployment และเอกสารประกอบ |

## 3. Scope

### In Scope

- Flutter app สำหรับผู้ใช้ทั่วไป
- Admin Web สำหรับผู้ดูแลระบบ
- Backend REST API
- MongoDB database
- Docker Compose สำหรับ build/run ระบบ
- Seed/backup data สำหรับ demo
- CCTV detector integration สำหรับสถานีที่มี `cameraUrl`
- เอกสารประกอบโปรเจกต์ใน `docs/`

### Out Of Scope / Current Limitations

- ระบบยังไม่มี payment หรือ booking seat
- Flutter passenger app ไม่ใช้ login/register ใน workflow ปัจจุบัน และเริ่มที่หน้า `Homepages`
- Report จากผู้ใช้ทั่วไปถูกบันทึกเป็น `reporterType: guest`
- รถในระบบ demo มี movement engine จำลองสถานะทุก 5 วินาที
- Detector ต้องมี camera URL จริงและ dependency Python/YOLO พร้อมใช้งาน
- Flutter folder ชื่อ `frontend-vue/` แต่เป็น Flutter app ไม่ใช่ Vue app

## 4. Functional Requirements

| ID | Requirement | Source |
|---|---|---|
| FR-01 | Admin login และรับ JWT token ได้ | `backend-node/routes/auth.js`, `admin-web/src/services/api.ts` |
| FR-02 | Admin-only endpoints ต้องตรวจ JWT และ `role: admin` | `backend-node/middleware/jwt.js`, `backend-node/middleware/admin.js` |
| FR-03 | Admin จัดการบัญชี admin/user ได้ | `backend-node/routes/auth.js`, `admin-web/src/page/Users.vue` |
| FR-04 | Flutter passenger app เข้าใช้งานแบบ guest โดยไม่ต้อง login/register | `frontend-vue/lib/main.dart`, `frontend-vue/lib/user/homepages.dart` |
| FR-05 | แอปแสดงสถานีตามสาย `line1`, `line2` ได้ | `backend-node/routes/station.js`, `frontend-vue/lib/user/homepages.dart` |
| FR-06 | แอปเลือก From/To station และแสดงเส้นทางบน Google Map ได้ | `frontend-vue/lib/user/homepages.dart` |
| FR-07 | แอปป้องกันการเลือกต้นทางและปลายทางซ้ำกัน | `frontend-vue/lib/user/homepages.dart` |
| FR-08 | แอปจำกัดปลายทางบางจุดตามทิศทางรถเพื่อลดเส้นทางย้อนศร | `frontend-vue/lib/user/homepages.dart` |
| FR-09 | แอปบันทึก favorite station ด้วย local storage/shared preferences ได้ | `frontend-vue/lib/user/favorite_station.dart`, `frontend-vue/lib/user/homepages.dart` |
| FR-10 | แอปส่ง report และ feedback ได้ | `frontend-vue/lib/user/report_page.dart`, `backend-node/routes/report.routes.js` |
| FR-11 | Admin จัดการสถานี เพิ่ม แก้ ลบ และดูทั้งหมดได้ | `backend-node/routes/station.js`, `admin-web/src/page/Stations.vue` |
| FR-12 | Admin ดู dashboard, crowd alerts และ dispatch guide ได้ | `admin-web/src/page/Dashboard.vue` |
| FR-13 | Admin ดูสถานะรถได้ | `backend-node/routes/bus.routes.js`, `admin-web/src/page/Buses.vue` |
| FR-14 | Admin ดู report, feedback, history และเปลี่ยนสถานะ report ได้ | `backend-node/routes/report.routes.js`, `admin-web/src/page/Reports.vue` |
| FR-15 | Auth module รองรับการจัดการบัญชีสำหรับ Admin Web | `backend-node/routes/auth.js`, `admin-web/src/page/Users.vue` |
| FR-16 | Admin start/stop detector และดู frame/stream ต่อสถานีได้ | `backend-node/routes/detector.routes.js`, `admin-web/src/page/StationCCTV.vue` |
| FR-17 | ระบบรองรับภาษาอังกฤษ/ไทยใน user app และ admin web | `frontend-vue/lib/services/language_service.dart`, admin pages |
| FR-18 | ระบบรันด้วย Docker Compose ได้ | `docker-compose.yml`, `docs/DOCKER.md` |

## 5. Non-Functional Requirements

| ID | Requirement | รายละเอียด |
|---|---|---|
| NFR-01 | Buildability | ต้อง build backend/admin web/docker ได้ตามคู่มือ |
| NFR-02 | Portability | Docker Compose ต้องรัน MongoDB, Backend, Admin Web และ optional Flutter Web |
| NFR-03 | Security | Admin endpoints ต้องใช้ JWT และ `role: admin` |
| NFR-04 | Data privacy | ห้าม commit secret/API key จริง และไม่ควรเผยแพร่ camera credential จริง |
| NFR-05 | Maintainability | ต้องมีเอกสาร project map, PRD, agent, ER, data dictionary |
| NFR-06 | Localization | UI หลักรองรับ EN/TH |
| NFR-07 | Observability | Backend มี `/health`; Docker มี healthcheck สำหรับ MongoDB/backend dependency |

## 6. User Workflows

### 6.1 Passenger Route Search

1. เปิด Flutter app
2. ระบบเปิดหน้า Home โดยไม่ต้อง login
3. เลือก `From station`
4. เลือก `To station`
5. ระบบเลือก line ที่เหมาะสมและวาด route บน map
6. ระบบแสดงข้อมูลรถที่ใกล้สถานีต้นทางและ ETA โดยประมาณ

Acceptance criteria:

- ผู้ใช้ทั่วไปไม่ต้องสมัครสมาชิกหรือ login ก่อนใช้งาน
- เลือก station เดียวกันเป็นต้นทาง/ปลายทางไม่ได้
- ค้นหาด้วยชื่อหรือ station id ได้
- กรณีสถานีที่มีข้อจำกัดทิศทาง ระบบต้องไม่แนะนำปลายทางย้อนทิศ

### 6.2 Passenger Report/Feedback

1. เปิด Help & Feedback
2. เลือกประเภทปัญหาหรือ Feedback
3. กรอก location/detail หรือให้คะแนนดาว
4. ส่งข้อมูลไป `/api/report`
5. Admin เห็นข้อมูลใน Reports page

Acceptance criteria:

- Report ปัญหาทั่วไปมี `status: pending`
- Feedback ไม่มีสถานะ pending และมี `feedbackAverage` เมื่อคะแนนถูกต้อง

### 6.3 Admin Station Management

1. Admin login
2. เปิด Station Setting
3. เพิ่ม/แก้/ลบสถานี
4. Backend validate id/name/lat/lng/lines/status/ROI

Acceptance criteria:

- `id` ห้ามซ้ำ
- `lines` ต้องมีอย่างน้อยหนึ่งค่าและต้องเป็น `line1` หรือ `line2`
- `status` ต้องเป็น `LOW`, `MEDIUM`, `HIGH`
- `detectionRoi` ต้องเป็น array ของ `[x, y]` ที่อยู่ระหว่าง 0 ถึง 1

### 6.4 Admin Detector Operation

1. Admin เปิด Station CCTV
2. เลือกสถานีที่มี `cameraUrl`
3. Start detector
4. ดู status/frame/stream
5. Stop detector เมื่อเลิกใช้งาน

Acceptance criteria:

- ถ้าไม่มี station ต้องตอบ 404
- ถ้าไม่มี `cameraUrl` ต้องตอบ 400
- stream ต้องตรวจ token ได้จาก header หรือ query token

## 7. API Summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/register` | No | legacy/general register endpoint; ไม่อยู่ใน passenger app workflow ปัจจุบัน |
| `POST` | `/auth/login` | No | Admin Web login และรับ token |
| `GET` | `/auth/user` | Token | อ่าน profile; ไม่อยู่ใน passenger app workflow ปัจจุบัน |
| `PUT` | `/auth/update` | Token | แก้ profile; ไม่อยู่ใน passenger app workflow ปัจจุบัน |
| `GET` | `/auth/admin/users` | Admin token | list users |
| `POST` | `/auth/admin/users` | Admin token | create admin |
| `PUT` | `/auth/admin/user/:username/role` | Admin token | update role |
| `DELETE` | `/auth/admin/user/:username` | Admin token | delete user |
| `GET` | `/station/:line` | No | list public stations by line |
| `GET` | `/station/admin/all` | Admin token | list stations with admin fields |
| `POST` | `/station/admin` | Admin token | create station |
| `PUT` | `/station/admin/:id` | Admin token | update station |
| `DELETE` | `/station/admin/:id` | Admin token | delete station |
| `GET` | `/api/buses` | No | list buses |
| `POST` | `/api/report` | No | create report/feedback |
| `GET` | `/api/report` | No | list reports |
| `PUT` | `/api/report/:id` | No | update report status |
| `DELETE` | `/api/report/:id` | No | delete report |
| `GET` | `/api/detector/:stationId/status` | Admin token | detector status |
| `POST` | `/api/detector/:stationId/start` | Admin token | start detector |
| `POST` | `/api/detector/:stationId/stop` | Admin token | stop detector |
| `GET` | `/api/detector/:stationId/frame` | Admin token | latest JPEG frame |
| `GET` | `/api/detector/:stationId/stream` | Admin token/query token | MJPEG stream |
| `GET` | `/health` | No | healthcheck |

## 8. Data Requirements

ดูรายละเอียดเต็มใน `docs/data.md`

Collections หลัก:

- `users`
- `stations`
- `buses`
- `reports`

## 9. Deployment Requirements

ระบบต้องรันได้ 2 แบบ:

1. Manual setup ด้วย Node.js, MongoDB, Flutter SDK
2. Docker Compose จาก root project

คำสั่ง Docker หลัก:

```bash
docker compose up -d --build
```

หลังรัน:

- Backend API: `http://localhost:5001`
- Admin Web: `http://localhost:8080`
- Optional Flutter Web: `http://localhost:8081`
- MongoDB: `localhost:27017`

## 10. Exam Readiness Checklist

- `docs/projectmap.md` มีแผนที่ repo และ source truth
- `docs/prd.md` มี requirement และ acceptance criteria
- `docs/agent.md` มี architecture/workflow
- `docs/er.md` มี relation ของข้อมูล
- `docs/data.md` มี schema/index/seed
- `docker-compose.yml` build/run ได้
- โปรเจกต์อยู่ใน Git/GitHub
- รูปเล่มบทที่ 1-5 จัดทำแยกตาม template มหาวิทยาลัย
