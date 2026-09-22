# Data Dictionary: MFU Shuttle Bus

เอกสารนี้อธิบาย database, collections, fields, seed data, backup และ validation rule ของระบบ

## 1. Database Config

| Config | Default | Source |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/` | `backend-node/config.js` |
| `DB_NAME` | `shuttlebus_web_system` | `backend-node/config.js` |
| Docker Mongo service | `mongodb://mongo:27017/` | `docker-compose.yml` |
| Docker exposed port | `27017:27017` | `docker-compose.yml` |

## 2. Collections

| Collection | Purpose | Main source |
|---|---|---|
| `users` | admin accounts and auth roles for Admin Web; passenger app uses guest flow | `backend-node/routes/auth.js` |
| `stations` | shuttle bus stations, map coordinates, line membership, CCTV config | `backend-node/routes/station.js` |
| `buses` | persisted GPS records; API projects registered vehicles | `backend-node/services/gps.js`, `backend-node/config/gps-fleet.json` |
| `reports` | passenger reports and feedback | `backend-node/routes/report.routes.js` |

## 3. `users` Collection

| Field | Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Yes | MongoDB id |
| `username` | string | Yes | admin/login username, unique |
| `email` | string | Yes | user email |
| `password` | string | Yes | bcrypt hash |
| `role` | string | Yes | `admin` or `user` |
| `createdAt` | Date | Optional | created date for admin-created users/import script |

Validation/behavior:

- Register endpoint requires `username`, `password`, `email`, but current passenger app does not use register/login
- Password is hashed with bcrypt
- Admin login signs JWT with `id`, `username`, `role`
- Admin role update only allows `admin` or `user`
- Admin cannot remove own admin role through role update route

Demo account from Docker backup:

```text
username: admin
password: 12345678
role: admin
```

## 4. `stations` Collection

| Field | Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Yes | MongoDB id |
| `id` | string | Yes | station id เช่น `station01` |
| `name` | string | Yes | English station name |
| `nameTH` | string | Optional | Thai station name |
| `lat` | number | Yes | latitude |
| `lng` | number | Yes | longitude |
| `lines` | string[] | Yes | IDs of existing service routes |
| `routeBearings` | object | Optional | Per-line bus heading in degrees `[0, 360)` for ambiguous polyline overlaps; see [routing.md](routing.md) |
| `waiting` | number | Optional | จำนวนคนรอ |
| `status` | string | Optional | `LOW`, `MEDIUM`, `HIGH` |
| `cameraUrl` | string | Optional | CCTV/stream URL |
| `detectionRoi` | array | Optional | ROI points as normalized `[x, y]` pairs |

Validation from `backend-node/routes/station.js`:

- `id` cannot be empty
- `name` cannot be empty
- `lat` and `lng` must be finite numbers
- `lines` must contain at least one existing route ID
- `routeBearings` optionally maps assigned route IDs to numeric headings; `null` or `{}` clears the hints
- `waiting` must be number >= 0
- `status` must be `LOW`, `MEDIUM`, or `HIGH`
- `detectionRoi` must be array of `[x, y]` where each value is 0..1, or `null` to reset to `[]`

Seed:

- `backend-node/seed/seed_station.js` seeds 22 stations
- `docker/mongo-init/backup/shuttlebus_system.stations.json` contains demo backup with Thai names

## 5. `buses` Collection และ public projection

ตารางนี้อธิบาย GPS records ปัจจุบัน ข้อมูล demo เก่าอาจมี fields อื่นที่ยังอยู่ใน collection แต่ไม่ใช่แหล่ง GPS ของ API

| Field ใน MongoDB | Type | ความหมาย |
|---|---|---|
| `_id` | string | `ppgps:<imei>` |
| `source` | string | `ppgps` |
| `imei`, `providerId` | string | device/provider identifiers ใช้เฉพาะหลังบ้าน |
| `busId` | string | รหัสรถจาก fleet registry |
| `lat`, `lng` | number | พิกัดที่ผ่าน validation |
| `speedRaw` | number/null | ความเร็วตาม provider |
| `speedUnit` | string | หน่วยที่ตั้งค่า หรือ `unknown` |
| `speedKph` | number/null | คำนวณเฉพาะเมื่อยืนยันหน่วยแล้ว |
| `directionRaw` | number/null | heading ที่ผ่าน validation |
| `movement` | string | `moving`, `stopped`, `unknown` |
| `alarm` | string | ข้อความ provider จำกัดความยาว |
| `lastGpsAt` | date | เวลา GPS จริง |
| `receivedAt` | date | เวลารับข้อมูลใน backend |

`GET /api/buses` ไม่คืน raw documents ทั้งหมด แต่ประกอบรถตาม `config/gps-fleet.json`
พร้อม `busNumber`, `line`, `status`, `feedHealthy`, `freshness`, `connectionStatus` และเวลา ISO
ไม่ส่ง `imei` หรือ `providerId` ออกทาง public projection
พิกัดอาจเป็น null สำหรับรถที่ยังไม่มี GPS และ `line` อาจเป็น null สำหรับรถที่ยังไม่กำหนดสาย

`GET /api/buses/snapshot` และ Broadcast ใช้ projection เดียวกัน ห่อด้วย `schemaVersion`, `streamId`, `sequence`, `capturedAt`
snapshot cache อยู่ในหน่วยความจำ Node ไม่ใช่ collection ใหม่หรือ Postgres table
MongoDB ยังเป็นฐานข้อมูลหลัก ดู [REALTIME.md](REALTIME.md) สำหรับ contract และสิทธิ์การรับข้อมูล

`seed_bus.js` สร้างรถจำลองเก่า ไม่ได้ใช้แทน provider GPS และไม่ควรรันเป็นขั้นตอนบังคับของการติดตั้ง Realtime

## 6. `reports` Collection

| Field | Type | Required | Description |
|---|---|---|---|
| `_id` | ObjectId | Yes | MongoDB id |
| `type` | string | Yes | issue category or `Feedback` |
| `detail` | string | Optional | report details |
| `location` | string | Optional | user-entered location |
| `reporterType` | string | Yes | currently `guest` |
| `time` | Date | Yes | creation time |
| `status` | string | Optional | set to `pending` for non-feedback reports |
| `feedbackRatings` | array | Optional | sanitized rating objects |
| `feedbackAverage` | number | Optional | average score 1..5 |

Feedback rating item:

| Field | Type | Description |
|---|---|---|
| `key` | string | feedback category key |
| `label` | string | display label |
| `score` | number | integer 1..5 |
| `description` | string | score description |

Behavior:

- Non-feedback report gets `status: pending`
- Feedback report can store `feedbackRatings` and `feedbackAverage`
- Admin report list hides user identity fields via projection
- Reports backup JSON is currently `[]`

## 7. Indexes

Created by Docker import script:

```js
db.stations.createIndex({ id: 1 }, { unique: true });
db.stations.createIndex({ lines: 1 });
db.buses.createIndex({ busNumber: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 });
```

Created by station seed:

```js
db.stations.createIndex({ id: 1 }, { unique: true });
db.stations.createIndex({ lines: 1 });
```

## 8. Backup And Import

Backup files:

```text
docker/mongo-init/backup/shuttlebus_system.buses.json
docker/mongo-init/backup/shuttlebus_system.reports.json
docker/mongo-init/backup/shuttlebus_system.stations.json
docker/mongo-init/backup/shuttlebus_system.users.json
```

Import script:

```text
docker/mongo-init/001-import-backup.sh
```

Docker official Mongo image runs this script only when the Mongo volume is first created. If `mongo-data` already exists, backup will not import again automatically.

## 9. Manual Seed Commands

```bash
cd backend-node
node seed/seed_station.js
node seed/seed_bus.js
```

Docker seed commands:

```bash
docker compose exec backend node seed/seed_station.js
docker compose exec backend node seed/seed_bus.js
```

## 10. Data Change Checklist

When changing schema or seed data:

1. Update backend validation and route behavior
2. Update Admin Web `admin-web/src/types.ts`
3. Update both Vue consumers if affected
4. Update seed files and Docker backup JSON
5. Update `docs/data.md`
6. Update `docs/er.md` if relationships changed
7. Run relevant build/analyze checks

## 11. Crowd Settings And Public Station Data

MongoDB collection `settings` เก็บเอกสารเดียว `_id: "crowd-thresholds"` ใช้ร่วมกันทุกสถานี

| Field | รูปแบบ / ความหมาย |
|---|---|
| `low`, `medium`, `high` | `{ min, max }` จำนวนเต็มไม่ติดลบ; API ยอมรับ `max >= min`, `null` คือไม่จำกัด |
| `colors` | `{ low, medium, high }` เป็น HEX `#RRGGBB` เก็บเป็นตัวพิมพ์เล็ก |
| `names` | ชื่อแสดงแทนของสามระดับหลัก; ไม่เปลี่ยน ID |
| `customStatuses` | สูงสุด 20 รายการ `{ id, name, min, max, color }`; ID รูปแบบ `custom_...` ต้องไม่ซ้ำ |
| `updatedAt` | วันที่บันทึกสำเร็จ |

ค่าเริ่มต้นคือ Low 0–5, Medium 6–9, High 10 ขึ้นไป สี `#2eb85c`, `#f59e0b`, `#dc3545` ตามลำดับ
ชื่อทุกระดับต้องไม่ซ้ำกันแบบ case-insensitive ยาว 1–60 ตัวอักษรและไม่ใช่ `unknown` ช่วงเรียงตาม low → medium → high → customStatuses โดยไม่ทับกัน อนุญาตให้แถวสุดท้ายเท่านั้นมี `max: null`
หน้า Settings ตรวจ To มากกว่า From แม้ API ยอมรับช่วงค่าเดียวได้ เป็นข้อแตกต่างปัจจุบันระหว่าง UI และ API
อ่านรูปแบบเดิม `{ medium: 6, high: 10 }` ได้โดยแปลงในหน่วยความจำ; ไม่เขียนทับข้อมูลเก่าอัตโนมัติ

`GET/PUT /api/settings/crowd-thresholds` ต้องใช้ Admin JWT; PUT ตรวจค่าก่อนเขียนและคืน 400 เมื่อค่าไม่ถูกต้อง

แยกจาก `stations.status` และ validation ของ station CRUD ที่ยังรับ LOW/MEDIUM/HIGH: สถานะสาธารณะคำนวณจาก `waiting` กับ settings และอาจเป็น `LOW`, `MEDIUM`, `HIGH`, `custom_...` หรือ `UNKNOWN`
ข้อมูลที่ส่งมี `statusColor` และ `statusLabel` เพิ่มด้วย โดย `UNKNOWN` ใช้สี `#64748b` และชื่อที่ไม่ได้ override อาจเป็นข้อความว่างให้ client แปลเอง

User Web โหลด `GET /api/public-data` แล้วรับ `public.updated` เพื่ออัปเดตค่า ส่วน metadata/geometry ใช้ `catalogVersion` และ `routesVersion` ดู [protocol และ fallback](REALTIME.md#จำนวนคนรอและ-cache-เส้นทาง)
