# ใช้งานและพัฒนา Supabase Realtime

คู่มือนี้อธิบายพฤติกรรมที่มีในโค้ดปัจจุบัน อัปเดต 16 กันยายน 2026
เริ่มติดตั้งเครื่องใหม่ที่ [HANDOVER.md](HANDOVER.md)

## ข้อมูลเดินทางอย่างไร

```mermaid
flowchart LR
  GPS[ผู้ให้บริการ GPS] --> Worker[Node GPS worker]
  Worker --> Mongo[(MongoDB)]
  Worker --> Cache[Bus snapshot ใน Node]
  Cache --> API[GET /api/buses/snapshot]
  Cache --> Publish[ส่ง Broadcast ด้วย Secret key]
  Publish --> Supabase[Supabase ช่อง mfu-buses]
  Supabase --> Passenger[เว็บผู้โดยสาร]
  Supabase --> Admin[เว็บแอดมิน]
  API --> Passenger
  API --> Admin
```

Supabase ไม่ได้ติดตามการเปลี่ยนแปลง MongoDB อัตโนมัติ Node เป็นผู้ส่งหลังจบรอบ GPS
ฐานข้อมูลเดิมและการล็อกอินผ่าน Node JWT ยังคงใช้งาน ไม่ต้องสร้าง Supabase Auth user หรือตารางข้อมูลรถใน Postgres

## ตั้งค่า Supabase ครั้งแรก

1. ใช้โปรเจกต์ Supabase ของทีม หรือสร้างโปรเจกต์สำหรับสภาพแวดล้อมใหม่
2. คัดลอก Project URL และ Publishable key ไป `admin-web/.env` และ `frontend-vue/.env`
3. คัดลอก Project URL และ Secret key ไป root `.env` สำหรับ Node
4. เปิด [backend-node/sql/realtime.sql](../backend-node/sql/realtime.sql) คัดลอกทั้งหมดไป Supabase → SQL Editor → New query → Run
5. ตรวจว่ามี policy `mfu_bus_receive` และ `mfu_bus_no_client_send` ในผลลัพธ์
6. ใน Realtime Settings ปิด Allow public access หากโปรเจกต์ไม่ต้องใช้ช่องสาธารณะอื่น
7. รีสตาร์ต Node และ Vite ทั้งสองเว็บ

SQL สามารถรันซ้ำเพื่อปรับ policy สองตัวของระบบนี้ โดยไม่ย้ายหรือลบข้อมูล MongoDB
ไม่ต้องเปิด Data API เพื่อใช้ Broadcast และไม่ต้องสร้าง Storage Bucket
รายละเอียดผู้ให้บริการ: [Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)

## ไฟล์ env

Root `.env` สำหรับ backend:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_REPLACE_ME
```

ใน `.env` ของเว็บทั้งสอง:

```env
VITE_API_BASE_URL=http://localhost:5101
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

ค่าเหล่านี้เป็นตัวอย่าง ต้องแทนด้วยค่าจริงของทีม Secret key ใช้ได้เฉพาะ Node และไม่ต้องส่งให้คนที่ทำเฉพาะ UI
`backend-node/app.js` โหลด root `.env`; environment ที่กำหนดให้ process อยู่แล้วมีผลก่อนค่าในไฟล์
Docker ส่ง Secret key เข้า backend ตอนรัน และส่ง Publishable key เข้า Vite ตอน build

## Protocol ที่โค้ดใช้

| รายการ | ค่า |
|---|---|
| Topic | `mfu-buses` |
| Channel config | `{ private: true }` |
| Event | `buses.updated` |
| Initial/reconnect API | `GET /api/buses/snapshot` |
| API เดิมที่ยังรองรับ | `GET /api/buses` คืน array |
| Diagnostics สำหรับ admin | `GET /api/buses/gps-status` พร้อม JWT admin |

ตัวอย่าง payload (ข้อมูลสมมติ):

```json
{
  "schemaVersion": 1,
  "streamId": "unique-server-instance-id",
  "sequence": 12,
  "capturedAt": "2026-09-16T10:00:00.000Z",
  "buses": [
    {
      "busId": "MFU01",
      "lat": 20.05,
      "lng": 99.89,
      "status": "RUNNING",
      "connectionStatus": "fresh",
      "feedHealthy": true,
      "lastGpsAt": "2026-09-16T09:59:58.000Z"
    }
  ]
}
```

- `streamId` เปลี่ยนเมื่อ Node เริ่มใหม่; `sequence` เพิ่มภายใน instance เดียว
- `capturedAt` คือเวลาสร้าง snapshot; `lastGpsAt` คือเวลาพิกัดจริง ห้ามใช้เวลาได้รับข้อความแทนเวลา GPS
- `buses` เป็นข้อมูลรถทั้งชุด ไม่ใช่เฉพาะคันที่เปลี่ยน ใช้แทนชุดเดิมได้
- Snapshot cache ช่วยให้ผู้ใช้หลายคนแชร์การอ่าน MongoDB; cache หมดอายุ 5 วินาทีหรือถูก refresh โดย GPS worker
- การส่งมี timeout 10 วินาที ถ้ายังส่งอยู่ รอบซ้อนจะถูกข้ามเพื่อไม่สะสมข้อมูลเก่า
- ความล้มเหลวของ Supabase ไม่ทำให้ GPS worker หรือ API เดิมหยุด

## การรับข้อมูลและ fallback

`busFeed.ts` ในเว็บทั้งสองมี logic ชุดเดียวกัน:

1. เริ่ม subscribe พร้อมโหลด snapshot จาก API
2. เก็บ event ที่มาก่อน snapshot และตรวจ sequence ก่อนนำไปใช้
3. เมื่อมี event ใหม่ใน stream เดิม ใช้ payload อัปเดตหมุด/รายการรถโดยตรง ไม่ GET ซ้ำทุก event
4. เมื่อ Node เริ่มใหม่ ยืนยัน stream ใหม่ผ่าน API ก่อนรับชุดใหม่
5. หลัง reconnect, กลับเข้าแท็บ หรือกลับ online ให้โหลด snapshot เพื่อเติมข้อมูลที่พลาด
6. ถ้าไม่มี event เกิน 15 วินาทีหรือ channel ไม่ได้เชื่อม ให้โหลด API ทุก 5 วินาที
7. เมื่อปิด component หรือออกจากระบบ admin จะยกเลิก subscription, timer และ request ที่ค้าง

ไม่มี Supabase env ก็ใช้ API fallback ได้ แต่ถ้าไม่มี backend จะโหลด snapshot ไม่ได้
หน้าแอดมินยังโหลด GPS diagnostics ทุก 30 วินาที และ API สถานี/รายงาน/detector ยังมีรอบโหลดของตนเอง
GET ตอนเปิดหน้าและหลัง reconnect เป็นพฤติกรรมปกติ จำนวน request จึงไม่ได้เป็นศูนย์

## สิทธิ์และการทำงานเป็นทีม

Private ในที่นี้หมายถึงช่องที่ผ่านการตรวจ policy; ข้อมูลรถเป็นข้อมูลที่ผู้โดยสารทั่วไปอ่านได้อยู่แล้ว
policy จึงให้ `anon` และ `authenticated` รับเฉพาะ Broadcast ของ topic รถ และห้าม INSERT ของ client บน topic นี้
ผู้ใช้ไม่ต้องสมัคร Supabase เพื่อดูรถ ตัวส่งหลังบ้านใช้ Secret key

ห้ามเพิ่มข้อมูลบัญชี รายงานส่วนตัว URL กล้อง หรือ token ลงใน payload นี้ หากจะทำ Realtime ของข้อมูลแอดมิน ต้องออกแบบช่องและสิทธิ์แยกต่างหาก

ใช้ backend/GPS worker หนึ่งตัวต่อสภาพแวดล้อม ขณะนี้ snapshot อยู่ในหน่วยความจำ Node
การเปิด worker หลายตัวด้วย Supabase โปรเจกต์เดียวกันจะมีหลาย `streamId` และอาจส่งข้อมูลคนละฐานมาปนกัน
เพื่อนที่ทำ UI ควรชี้ไป backend กลางของทีม หรือใช้ Supabase โปรเจกต์แยกสำหรับเครื่องตนเอง
ก่อนเพิ่มหลาย backend instance ต้องมี shared snapshot/version store และกำหนด worker ที่รับผิดชอบการดึง GPS

## ตรวจว่าทำงานจริง

### 1. API และตัวส่ง

จาก root repository:

```bash
curl http://localhost:5101/health
curl http://localhost:5101/api/buses/snapshot
node backend-node/scripts/check-realtime.js
```

`check-realtime.js` ส่งข้อมูลว่างไปช่องทดสอบส่วนตัวชื่อสุ่ม ไม่ส่งเข้าช่องรถจริง
ผล `{"ok":true}` ยืนยันว่า Supabase รับคำขอ ไม่ได้ยืนยันว่าหน้าบ้านรับ event แล้ว

### 2. ดูใน Chrome

1. เปิดเว็บผู้โดยสารหรือหน้าแอดมินที่ล็อกอินแล้ว
2. คลิกขวาบนหน้าเว็บ → Inspect → Network (บน Mac ใช้ Cmd+Option+I ได้)
3. เลือก WS หรือ Socket แล้วเปิดรายการเชื่อมต่อ Supabase ดู Messages/Frames
4. ค้นหา `buses.updated` ควรมีข้อมูลใหม่ตามรอบ GPS
5. กลับไป Fetch/XHR กรอง `buses/snapshot` ควรมีตอนเริ่มต้น/เชื่อมใหม่ และหยุดยิงซ้ำระหว่างมี event ต่อเนื่อง
6. เปลี่ยน Network เป็น Offline แล้วกลับ No throttling ตรวจว่าข้อมูลกลับมา; โหมด Offline บางเบราว์เซอร์อาจไม่ตัด WebSocket ทันที ให้ดูสถานะและการรับข้อความประกอบ

ตำแหน่งรถอาจไม่ขยับหากรถจอด ให้ดู `sequence` และ `lastGpsAt` ประกอบ
ข้อมูลจำนวนคนรอที่สถานียังไม่ได้ย้ายมา Broadcast

### 3. ตรวจจากฝั่งแอดมิน

Network → `/api/buses/gps-status` → Response มี `realtime`:

- `configured`: มี URL/key ในรูปแบบที่ตัวส่งรับ ไม่ได้ยืนยันว่าคีย์ถูกต้อง
- `busy`: กำลังส่งหรือไม่
- `lastSuccessAt`: ส่งสำเร็จครั้งล่าสุด
- `lastError`: เช่น `http_401`, `http_403`, `publish_failed`

อย่าคัดลอก Authorization header หรือคีย์ลง issue/public chat

## แก้ปัญหาที่พบบ่อย

| อาการ | ตรวจ/แก้ |
|---|---|
| `Cannot GET /api/buses/snapshot` | backend ยังเป็นโค้ดเก่า รีสตาร์ต Node จาก checkout นี้ |
| snapshot GET ยังยิงทุก 5 วินาที | ดู WS, policy, URL/key และตัวส่ง นี่เป็น fallback ไม่จำเป็นต้องเป็นบั๊ก |
| `http_401` จากตัวส่ง | คัดลอก Secret key value ใหม่ ไม่ใช้ชื่อคีย์หรือ Publishable key |
| subscribe ไม่สำเร็จ/`CHANNEL_ERROR` | ตรวจว่า SQL อยู่โปรเจกต์เดียวกับ URL/key และ topic เป็น `mfu-buses`, `private: true` |
| sender ส่งได้ แต่เว็บเงียบ | เช็ก URL สองเว็บกับ root, policy SELECT และมี event รถจาก GPS worker จริงหรือไม่ |
| `publish_failed` | อาจเป็น network/timeout หรืออ่าน snapshot ไม่สำเร็จ ดูสถานะ MongoDB และลอง check script |
| รถ stale/ETA ไม่มี | ตรวจ GPS จริงตาม [GPS.md](GPS.md); Realtime ไม่ทำให้พิกัดเก่ากลายเป็นใหม่ |
| เปลี่ยน `.env` แล้วไม่เปลี่ยน | รีสตาร์ต Vite/Node; ถ้า Docker ต้อง rebuild เว็บ |
| พอร์ตถูกใช้อยู่ | ปิด process เก่าที่ตนเปิด หรือกำหนดพอร์ตและ `VITE_API_BASE_URL` ให้ตรงกัน |
| Google Maps ไม่ขึ้นแต่ WS ทำงาน | ตรวจ Maps key, referrer และ quota แยกจาก Supabase |

## คำสั่งตรวจสอบโค้ด

รันจาก root repository:

```bash
node --test backend-node/test/bus-snapshots.test.js backend-node/test/gps.test.js backend-node/test/supabase.test.js
node --experimental-strip-types --test frontend-vue/test/busFeed.test.mjs frontend-vue/test/arrival.test.mjs frontend-vue/test/liveGps.test.mjs frontend-vue/test/routePlanning.test.mjs
npm --prefix frontend-vue run build
npm --prefix admin-web run build
git diff --check
```

ชุดแรก 18 tests, ชุดที่สอง 35 tests ณ วันที่อัปเดต รวม 53 tests
เป็น unit/integration tests ด้วยข้อมูลทดสอบ; การส่งไป Supabase จริงใช้ check script และการดู WebSocket เพิ่มเติม

## จุดแก้ไขเมื่อพัฒนาต่อ

| งาน | ไฟล์ |
|---|---|
| อ่าน GPS / สุขภาพ feed | `backend-node/services/gps.js` |
| เชื่อม worker กับ publisher | `backend-node/services/gps-runtime.js` |
| cache / sequence | `backend-node/services/bus-snapshots.js` |
| ส่ง Broadcast / timeout | `backend-node/services/supabase.js` |
| HTTP snapshot / diagnostics | `backend-node/routes/bus.routes.js` |
| สิทธิ์ Supabase | `backend-node/sql/realtime.sql` |
| ตั้งค่า client | `src/services/supabase.ts` ของทั้งสองเว็บ |
| subscribe / fallback / ordering | `src/services/busFeed.ts` ของทั้งสองเว็บ |
| ใช้ข้อมูลบนหน้าจอ | `src/App.vue` ของทั้งสองเว็บ |

ถ้าแก้ protocol/fallback ต้องแก้ `busFeed.ts` ทั้งสองชุดและทดสอบทั้งคู่
หากเพิ่ม Realtime ให้จำนวนคนรอ ต้องเชื่อมจุดที่ detector บันทึกข้อมูล ออกแบบ payload และสิทธิ์ก่อนลด polling
Broadcast ไม่ได้เก็บประวัติให้แอปเรียกคืน; API snapshot ยังจำเป็นสำหรับผู้ใช้ใหม่และการเชื่อมต่อกลับมา
แพ็กเกจ Free มีข้อจำกัดข้อความและการเชื่อมต่อ ตรวจ [หน้า Limits](https://supabase.com/docs/guides/realtime/limits) ก่อนขยายจำนวนผู้ใช้ ไม่ถือว่าทดสอบสองเว็บผ่านแล้วจะรองรับผู้ใช้ไม่จำกัด
