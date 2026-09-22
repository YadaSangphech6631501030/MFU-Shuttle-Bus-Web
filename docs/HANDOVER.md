# คู่มือรับช่วงพัฒนา MFU Shuttle Bus Web

อัปเดตตามโค้ดวันที่ 16 กันยายน 2026 เริ่มจากเอกสารนี้สำหรับสมาชิกทีมที่เพิ่งรับโค้ด

## ระบบที่ต้องรัน

| ส่วน | เทคโนโลยี | Local URL ตามคำสั่งด้านล่าง |
|---|---|---|
| Backend | Node.js / Express | http://localhost:5101 |
| ผู้ดูแลระบบ | Vue 3 / Vite ใน `admin-web/` | http://localhost:5173 |
| ผู้โดยสาร | Vue 3 / Vite ใน `frontend-vue/` | http://localhost:5174 |
| ฐานข้อมูล | MongoDB | mongodb://localhost:27017/ |
| Realtime รถ | Supabase Broadcast | ใช้โปรเจกต์ Supabase ของทีม |

ข้อมูลหลักยังอยู่ MongoDB (`shuttlebus_web_system` โดยค่าเริ่มต้น) Supabase ใช้ส่งข้อมูลรถที่เปลี่ยนเท่านั้น ยังไม่ได้ย้ายฐานข้อมูล และไม่ต้องสร้าง Storage Bucket
เว็บผู้โดยสารและแอดมินเป็น Vue; ไม่ต้องติดตั้ง Flutter เพื่อรันเว็บสองส่วนนี้

## 1. ขอข้อมูลจากคนส่งงาน

- โค้ดชุดล่าสุด รวมไฟล์ใหม่และ lockfile ของทั้งสามโฟลเดอร์ ตรวจให้แน่ใจว่าการแก้ไขถูก commit/push ก่อนให้เพื่อน pull
- ค่า environment ผ่านช่องทางส่วนตัวของทีม: MongoDB, JWT secret, Google Maps key, Supabase URL/keys และ GPS account
- บัญชีแอดมินสำหรับสภาพแวดล้อมทดสอบ
- ยืนยันว่าทีมใช้ MongoDB และ Supabase โปรเจกต์ไหน และใครเป็นผู้รัน GPS worker
- ถ้าต้องดู Dashboard ของ Supabase ให้เจ้าของเชิญบัญชีของเพื่อนเข้า Organization ไม่แชร์รหัสผ่านบัญชีเจ้าของ

ผู้พัฒนาที่แค่รันเว็บด้วย URL และ Publishable key ไม่จำเป็นต้องมีบัญชี Dashboard ทุกคน
ห้ามส่ง `.env` หรือคีย์จริงผ่าน Git; `.env.example` เป็นตัวอย่างเท่านั้น

## 2. เตรียมเครื่องและ dependencies

ใช้ Node.js รุ่นที่รองรับ built-in type stripping เช่น 22.6+ สำหรับคำสั่งทดสอบ TypeScript ในคู่มือนี้, npm และ MongoDB ที่เปิดใช้งานแล้ว
Python/YOLO จำเป็นเฉพาะเมื่อต้องใช้งาน detector จริง

รันจากโฟลเดอร์หลักของ repository:

```bash
npm ci --prefix backend-node
npm ci --prefix admin-web
npm ci --prefix frontend-vue
```

ไม่ต้องรัน `npm install` ที่โฟลเดอร์หลักเพื่อเปิดเว็บ แต่ละส่วนมี `package.json` ของตัวเอง

## 3. เตรียมไฟล์ตั้งค่า

ทุกส่วนใช้ root `.env` ไฟล์เดียว ทำเฉพาะเมื่อยังไม่มีไฟล์ ห้ามคัดลอกทับ `.env` ที่กรอกค่าแล้ว
คำสั่งนี้ใช้กับ macOS/Linux; บน Windows คัดลอกไฟล์ผ่าน VS Code ได้:

```bash
cp .env.example .env
```

| ส่วนใน root `.env` | ค่าที่เพื่อนต้องกรอก | โปรแกรมที่อ่าน |
|---|---|---|
| Backend / MongoDB / Supabase | `MONGO_URI` ถ้าไม่ได้ใช้ local, `DB_NAME`, `SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | `backend-node/config.js` ผ่าน API, seed และ scripts |
| GPS | บัญชี `GPS_USERNAME`, `GPS_PASSWORD` หรือ `GPS_ENABLED=false` สำหรับทำ UI โดยไม่ดึง GPS | `backend-node/config.js` |
| Browser | `VITE_API_BASE_URL`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Vite ของทั้งสองเว็บ |

`SECRET_KEY` คือคีย์ JWT ของระบบเดิม ส่วน `SUPABASE_SECRET_KEY` คือคีย์หลังบ้านที่คัดลอกจาก Supabase API Keys เป็นคนละค่า
ใช้ URL/keys จาก Supabase โปรเจกต์เดียวกันทุกส่วน อย่าใส่ Secret key ในตัวแปร `VITE_*`
Vite ของทั้งสองเว็บอ่าน root `.env` ผ่าน `envDir` และเปิดเผยเฉพาะตัวแปร `VITE_*` ให้ browser
Docker อ่านไฟล์เดียวกัน โดยส่งค่า Backend ตอนรันและค่าเว็บตอน build

หากทีมตั้ง Supabase แล้ว ไม่ต้องสร้างโปรเจกต์ใหม่ ทำตาม [คู่มือ Realtime](REALTIME.md) เพื่อยืนยันสิทธิ์และการเชื่อมต่อ
หากใช้ backend กลางร่วมกัน ให้ชี้ `VITE_API_BASE_URL` ไปที่ backend นั้น และไม่ต้องเปิด Node/GPS worker ซ้ำบนเครื่องตนเอง

## 4. เปิดระบบ local

เปิด MongoDB ก่อน จากนั้นใช้ Terminal แยกสามแท็บ ทุกคำสั่งเริ่มจาก root repository:

Backend:

```bash
node backend-node/app.js
```

Admin Web:

```bash
npm --prefix admin-web run dev -- --port 5173 --strictPort
```

Passenger Web:

```bash
npm --prefix frontend-vue run dev -- --port 5174 --strictPort
```

ใช้ `--strictPort` เพื่อให้ทราบทันทีหากพอร์ตถูกใช้งาน ไม่ปล่อยให้ Vite เปลี่ยนพอร์ตเงียบ ๆ
หากเปลี่ยน `.env` ให้กด Ctrl+C แล้วเริ่มโปรแกรมนั้นใหม่
Backend ไม่มี `npm run dev` ใน package ปัจจุบัน ให้ใช้ `node backend-node/app.js`

เช็ก API:

```bash
curl http://localhost:5101/health
curl http://localhost:5101/api/buses/snapshot
```

`/health` ควรตอบ `{"status":"ok"}` ส่วน snapshot ต้องมี `streamId`, `sequence`, `capturedAt`, `buses`
health สำเร็จไม่ได้ยืนยันว่า GPS, กล้อง หรือ Supabase ใช้งานได้ทั้งหมด

## 5. ข้อมูลและบัญชีสำหรับเครื่องใหม่

ถ้าใช้ฐานข้อมูลร่วมกับทีม ให้ใช้ข้อมูลเดิม ไม่รัน seed ทับ
หากเป็นฐานข้อมูล local ใหม่ ให้ขอ backup ที่ตัดข้อมูลส่วนตัวแล้ว หรือเตรียมสถานี/บัญชีเฉพาะชุดทดสอบ
`seed_station.js` ลบสถานีเดิมทั้งหมดก่อนใส่ใหม่; `seed_bus.js` เป็นข้อมูลจำลองเก่า ไม่ใช่ข้อมูล GPS ที่ API ปัจจุบันใช้

ถ้าจำเป็นต้องสร้างบัญชี admin บนฐานทดสอบใหม่ ให้กำหนด `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` ใน root `.env` ชั่วคราว แล้วรัน:

```bash
node backend-node/seed/seed_admin.js
```

Seed โหลด root `.env` ผ่าน `config.js` โดยอัตโนมัติ และจะอัปเดตบัญชีเดิมหากใช้ชื่อซ้ำ
ลบค่ารหัสผ่าน seed ออกจากไฟล์หลังใช้งาน ไม่ใช้รหัสผ่าน demo กับระบบจริง

## 6. ทดสอบก่อนส่งต่อ

- [ ] เว็บผู้โดยสารเปิดได้โดยไม่ต้องล็อกอิน และภาษาเปลี่ยนผ่าน TH | EN
- [ ] แอดมินล็อกอินและดู Dashboard/Buses ได้
- [ ] แผนที่โหลดได้ด้วย Google Maps key ของสภาพแวดล้อมนั้น
- [ ] GPS มีข้อมูลใหม่; ETA ไม่ใช้ข้อมูลที่เก่าเกินเกณฑ์
- [ ] เห็น WebSocket event `buses.updated` ในทั้งสองเว็บ
- [ ] `/api/buses/snapshot` ไม่ยิงทุก 5 วินาทีตลอดเวลาที่มี event ใหม่
- [ ] ตัด/ต่ออินเทอร์เน็ตแล้วข้อมูลกลับมาได้
- [ ] ไม่มี Secret key ใน frontend หรือไฟล์ตัวอย่าง
- [ ] Build/tests ใน [REALTIME.md](REALTIME.md#คำสั่งตรวจสอบโค้ด) ผ่าน

ณ วันที่อัปเดตเอกสาร: ทดสอบ build สองเว็บ, tests รวม 53 รายการ, รถจริง 16 คัน,
รับข้อความช่องส่วนตัว, ปฏิเสธการส่งด้วย Publishable key และการตัด/ต่ออินเทอร์เน็ตใน Chrome ผ่านแล้ว
ผลนี้เป็นหลักฐานของเครื่องที่ทดสอบ ไม่ใช่การรับรองว่าค่า env ของเครื่องใหม่ถูกต้อง

## 7. พัฒนาต่อที่ไหน

ดู [projectmap.md](projectmap.md) สำหรับรายการไฟล์ และ [REALTIME.md](REALTIME.md) สำหรับ protocol, สิทธิ์, fallback และ troubleshooting
ข้อมูล GPS ใช้ `buses.updated` ทั้งสองเว็บ ส่วน User Web โหลด `/api/public-data` ครั้งแรกและรับจำนวนคน/สถานะสถานีผ่าน `public.updated` บน private channel เดียวกัน
Admin Web ยังโหลดข้อมูลสถานีผ่าน API เดิม รายงานและ detector ยังใช้ API ตามเดิม ดูรายละเอียดและ fallback ใน [REALTIME.md](REALTIME.md#จำนวนคนรอและ-cache-เส้นทาง)
อย่าเพิ่มข้อมูลกล้อง ผู้ใช้ หรือรายงานส่วนตัวลงช่องรถที่ผู้โดยสารอ่านได้

สำหรับ Docker ใช้ [DOCKER.md](DOCKER.md) และสำหรับวิธีใช้หน้าเว็บใช้ [HANDBOOK.md](HANDBOOK.md)

## ตรวจรับ Settings และข้อมูลสถานีเพิ่มเติม

- [ ] Admin เปิด Settings กดดินสอ แก้ชื่อ สี/HEX และ From–To แล้วบันทึก จากนั้นรีโหลดเพื่อยืนยันค่าคงอยู่
- [ ] ช่วงตัวเลขที่ชนกันหรือชื่อซ้ำบันทึกไม่ได้; เว้น To ว่างได้เฉพาะแถวสุดท้าย
- [ ] เพิ่มสถานะใหม่โดยกำหนด To ของแถวก่อนหน้าให้สิ้นสุดก่อน From ของแถวใหม่
- [ ] User Web รับจำนวนคน สี และชื่อสถานะที่เปลี่ยนโดยไม่ต้องรีเฟรชหน้า และกลับมาโหลด snapshot ได้เมื่อ reconnect
- [ ] สำรอง collection `settings` และ `routes` ร่วมกับข้อมูลเดิม

ข้อจำกัดของการลบสถานะและรูปแบบข้อมูลดู [Admin Settings](HANDBOOK.md#37-admin-settings) และ [Data dictionary](data.md#11-crowd-settings-and-public-station-data)
รายการนี้เป็น checklist สำหรับทดสอบครั้งถัดไป ไม่ใช่ผลทดสอบ production ที่ยืนยันแล้ว
