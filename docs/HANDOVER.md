# คู่มือรับช่วงพัฒนา MFU Shuttle Bus Web

อัปเดตตามโค้ดวันที่ 23 กันยายน 2026 เริ่มจากเอกสารนี้สำหรับสมาชิกทีมที่เพิ่งรับโค้ด เมนูปัจจุบันใช้ Feedback แบบให้คะแนน ไม่ใช่ระบบติดตามสถานะ Report เดิม

## ระบบที่ต้องรัน

| ส่วน | เทคโนโลยี | Local URL / การเชื่อมต่อ |
|---|---|---|
| Backend | Node.js / Express | http://localhost:5101 |
| Admin Web | Vue 3 / Vite ใน `admin-web/` | ดู Local URL ใน Terminal ของ Admin |
| User Web | Vue 3 / Vite ใน `frontend-vue/` | ดู Local URL ใน Terminal ของ User |
| ฐานข้อมูล | MongoDB | mongodb://localhost:27017/ |
| Realtime รถและข้อมูลสถานีสาธารณะ | Supabase Broadcast | ใช้โปรเจกต์ Supabase ของทีม |

ข้อมูลหลักยังอยู่ MongoDB (`shuttlebus_web_system` โดยค่าเริ่มต้น) Supabase ส่งข้อมูลรถผ่าน `buses.updated` ให้ทั้งสองเว็บ และข้อมูลสาธารณะของสถานีผ่าน `public.updated` ให้ User Web ยังไม่ได้ย้ายฐานข้อมูล และไม่ต้องสร้าง Storage Bucket
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

ใช้ Node.js 22 รุ่น patch ล่าสุดให้ตรงกับ Docker ของโปรเจกต์, npm และ MongoDB ที่เปิดใช้งานแล้ว
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
cd backend-node
node app.js
```

Admin Web:

```bash
cd admin-web
npm run dev
```

User Web:

```bash
cd frontend-vue
npm run dev
```

เปิด URL ที่ Vite แสดงใน Terminal ของแต่ละเว็บ โดยปกติเว็บแรกใช้ 5173 และเว็บถัดไปใช้พอร์ตว่างถัดไป จึงไม่ควรสลับ URL ของ Admin กับ User
หากเปลี่ยน `.env` ให้กด Ctrl+C แล้วเริ่มโปรแกรมนั้นใหม่
Backend ไม่มี `npm run dev` ใน package ปัจจุบัน ให้ใช้ `node backend-node/app.js`

เช็ก API:

```bash
curl http://localhost:5101/health
curl http://localhost:5101/api/buses/snapshot
curl http://localhost:5101/api/public-data
```

`/health` ควรตอบ `{"status":"ok"}` ส่วน snapshot ต้องมี `streamId`, `sequence`, `capturedAt`, `buses`
`/api/public-data` เป็นข้อมูลเริ่มต้นของ User Web ตรวจว่ามีสถานีและเส้นทางตามฐานข้อมูลทดสอบ
health สำเร็จไม่ได้ยืนยันว่า GPS, กล้อง หรือ Supabase ใช้งานได้ทั้งหมด หากตั้งพอร์ต Backend ต่างจากค่าเริ่มต้น ให้เปลี่ยน URL ในคำสั่งและ `VITE_API_BASE_URL` ให้ตรงกัน

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
- [ ] เพิ่ม/แก้สถานีและเส้นทางบนฐานทดสอบแล้ว User Web เห็นข้อมูลตรงกัน ทดสอบ From–To และคำแนะนำจุดขึ้น/ลงรถ
- [ ] บันทึกสถานีโปรด รีโหลดแล้วรายการยังอยู่ในเบราว์เซอร์เดิม
- [ ] แผนที่โหลดได้ด้วย Google Maps key ของสภาพแวดล้อมนั้น
- [ ] GPS มีข้อมูลใหม่; ETA ไม่ใช้ข้อมูลที่เก่าเกินเกณฑ์
- [ ] เห็น WebSocket event `buses.updated` ในทั้งสองเว็บ
- [ ] User Web รับ `public.updated` เมื่อจำนวนคนหรือสถานะเปลี่ยน; การเห็น WebSocket ของ Vite อย่างเดียวไม่ยืนยัน Supabase
- [ ] `/api/buses/snapshot` ไม่ยิงทุก 5 วินาทีตลอดเวลาที่มี event ใหม่
- [ ] ตัด/ต่ออินเทอร์เน็ตแล้วข้อมูลกลับมาได้
- [ ] ไม่มี Secret key ใน frontend หรือไฟล์ตัวอย่าง
- [ ] Build/tests ใน [REALTIME.md](REALTIME.md#คำสั่งตรวจสอบโค้ด) ผ่าน

รายการนี้ต้องทดสอบใหม่กับ commit, environment และฐานข้อมูลที่จะส่งมอบ บันทึกวันที่และผลจริงของแต่ละรายการ ไม่ใช้จำนวน tests หรือผลจากเครื่องเดิมเป็นหลักฐานว่าเครื่องใหม่หรือ production พร้อมแล้ว

### ตรวจรับ Feedback

- [ ] User Web → Feedback: กรอกชื่อ อีเมล และคะแนน 1–5 ดาวครบทั้งห้าหัวข้อ แล้วส่งสำเร็จ ฟอร์มถูกล้าง
- [ ] ชื่อว่าง อีเมลผิดรูปแบบ หรือคะแนนไม่ครบส่งไม่ได้
- [ ] Admin Web → Feedback: เห็นรายการใหม่ ค้นหาชื่อ/อีเมลและกรองช่วงวันที่ได้
- [ ] Rating overview และคะแนนเฉลี่ยตรงกับทุกรายการที่ผ่านตัวกรอง ไม่ใช่แค่หน้าตารางปัจจุบัน
- [ ] View details แสดงอีเมลและคะแนนรายข้อถูกต้อง และเปลี่ยนหน้าตารางได้เมื่อมีหลายรายการ
- [ ] ลบเฉพาะ Feedback ทดสอบผ่านถังขยะและยืนยัน แล้วตรวจว่ารายการหายไป

หน้าปัจจุบันไม่มีการสร้างเหตุการณ์ Accident/Breakdown ไม่มีแท็บ Active reports/History และไม่มีขั้นตอนเปลี่ยน Pending → Resolved จึงไม่ใช้ workflow เดิมเป็นเกณฑ์ตรวจรับ

### ตรวจรับกล้องและบัญชีผู้ดูแล

- [ ] Station cameras: เลือกสถานีที่มี Camera URL ใช้งานได้ เริ่ม/หยุด detector และตรวจภาพกับจำนวนคนจริง
- [ ] วาด ROI แบบสี่เหลี่ยม บันทึก แล้วตรวจว่า detector ใช้พื้นที่ใหม่; หากกำลังทำงานจะเริ่มใหม่เมื่อบันทึก ROI
- [ ] เมนูรูปบัญชี → Profile Information เปิดรายการ Users; เพิ่มบัญชีทดสอบแล้วเข้าสู่ระบบได้ และ Log out ได้
- [ ] ไม่ลบตนเองหรือ Admin คนสุดท้าย หน้าปัจจุบันไม่มีฟอร์มเปลี่ยนรหัสผ่านหรือแก้ role

## 7. พัฒนาต่อที่ไหน

ดู [projectmap.md](projectmap.md) สำหรับรายการไฟล์ และ [REALTIME.md](REALTIME.md) สำหรับ protocol, สิทธิ์, fallback และ troubleshooting
ข้อมูล GPS ใช้ `buses.updated` ทั้งสองเว็บ ส่วน User Web โหลด `/api/public-data` ครั้งแรกและรับจำนวนคน/สถานะสถานีผ่าน `public.updated` บน private channel เดียวกัน
Admin Web ยังโหลดข้อมูลสถานีผ่าน API เดิม ส่วน Feedback และ detector ยังใช้ API ตามรอบ ไม่ได้เปลี่ยนทุก endpoint เป็น Realtime ดูรายละเอียดและ fallback ใน [REALTIME.md](REALTIME.md#จำนวนคนรอและ-cache-เส้นทาง)
อย่าเพิ่มข้อมูลกล้อง บัญชีผู้ใช้ ชื่อ อีเมล หรือรายละเอียด Feedback ลงช่องรถที่ผู้โดยสารอ่านได้

### ชื่อภายในที่ยังใช้ report

| ส่วน | ไฟล์หรือแหล่งข้อมูลปัจจุบัน |
|---|---|
| ฟอร์มผู้ใช้ | `frontend-vue/src/pages/FeedbackPage.vue` และการส่งข้อมูลใน `frontend-vue/src/App.vue` |
| หน้า Admin Feedback | `admin-web/src/page/Reports.vue` โดยคัดเฉพาะรายการ Feedback มาแสดง |
| API และฐานข้อมูล | `backend-node/routes/report.routes.js`, `/api/report` และ MongoDB collection `reports` |

ชื่อเหล่านี้ยังใช้จริงเพื่อรองรับข้อมูล Feedback ไม่ควรลบไฟล์ route หรือ collection เพียงเพราะเมนู Report ถูกแทนที่แล้ว หากจะเปลี่ยนชื่อ ต้องวางแผน migration และแก้ผู้เรียก API พร้อมกัน
Dashboard ยังมีการ์ด Pending reports ซึ่งนับรายการเก่าที่ไม่ใช่ Feedback และยังไม่ resolved ไม่ใช่จำนวน Feedback ใหม่ จึงเป็นงานโค้ดที่ต้องแยกพิจารณา ไม่ใช่ฟังก์ชันติดตาม Report ในคู่มือผู้ใช้

ก่อนเปิดสาธารณะต้องตรวจสิทธิ์ API โดยเฉพาะการอ่าน/แก้ไข/ลบ `/api/report` ซึ่งยังไม่มี middleware ตรวจสิทธิ์ และการสมัคร Admin ผ่าน `/auth/register-admin` อย่าถือว่าการซ่อนเมนูในเว็บป้องกันการเรียก API ได้ ดูรายการเตรียมใช้งานจริงใน [DEPLOY.md](DEPLOY.md)

สำหรับ Docker ใช้ [DOCKER.md](DOCKER.md) และสำหรับวิธีใช้หน้าเว็บใช้ [HANDBOOK.md](HANDBOOK.md)

## ตรวจรับ Settings และข้อมูลสถานีเพิ่มเติม

- [ ] Admin เปิด Settings กดดินสอ แก้ชื่อ สี/HEX และ From–To แล้วบันทึก จากนั้นรีโหลดเพื่อยืนยันค่าคงอยู่
- [ ] ช่วงตัวเลขที่ชนกันหรือชื่อซ้ำบันทึกไม่ได้; เว้น To ว่างได้เฉพาะแถวสุดท้าย
- [ ] เพิ่มสถานะใหม่โดยกำหนด To ของแถวก่อนหน้าให้สิ้นสุดก่อน From ของแถวใหม่
- [ ] ตรวจค่าที่ปลายช่วง เช่น Low 0–5, Medium 6–9, High 10 ขึ้นไป และกรณีจำนวนคนอยู่นอกทุกช่วงต้องเป็น UNKNOWN; ไม่เพิ่ม Very High โดยอัตโนมัติ
- [ ] User Web รับจำนวนคน สี และชื่อสถานะที่เปลี่ยนโดยไม่ต้องรีเฟรชหน้า และกลับมาโหลด snapshot ได้เมื่อ reconnect
- [ ] สำรอง collection `settings` และ `routes` ร่วมกับข้อมูลเดิม

ข้อจำกัดของการลบสถานะและรูปแบบข้อมูลดู [Admin Settings](HANDBOOK.md#37-admin-settings) และ [Data dictionary](data.md#11-crowd-settings-and-public-station-data)
รายการนี้เป็น checklist สำหรับทดสอบครั้งถัดไป ไม่ใช่ผลทดสอบ production ที่ยืนยันแล้ว
