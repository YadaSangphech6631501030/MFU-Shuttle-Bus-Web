# MFU Shuttle Bus

ระบบ Shuttle Bus สำหรับมหาวิทยาลัย ประกอบด้วย Backend API, หน้า Admin Web และหน้า Passenger Web สำหรับผู้ใช้งานทั่วไป

## Project Structure

- `backend-node/` - Backend API ด้วย Node.js, Express และ MongoDB
- `admin-web/` - หน้าเว็บผู้ดูแลระบบด้วย Vue 3 และ Vite
- `frontend-vue/` - หน้าเว็บผู้โดยสารด้วย Vue 3 และ Vite
- `docs/` - คู่มือระบบ การติดตั้ง การส่งต่อ และ Supabase Realtime

## Main Features

- จัดการสถานี shuttle bus และข้อมูลกล้อง CCTV
- Dashboard สำหรับดูภาพรวมระบบ แผนที่สถานี และ crowd alerts
- หน้า Buses สำหรับดูสถานะรถและข้อมูล GPS
- หน้า Passenger สำหรับเลือก From/To station ดูเส้นทาง ETA และรถแบบ Realtime
- ระบบรายงานปัญหาและ feedback พร้อมหน้า Reports สำหรับผู้ดูแลระบบ
- จัดการเส้นทาง สถานี ผู้ใช้ และ detector จาก Admin Web
- รองรับภาษาอังกฤษและภาษาไทยใน Passenger Web และ Admin Web
- ส่งตำแหน่งรถผ่าน Supabase Realtime โดยมี API fallback เมื่อการเชื่อมต่อหลุด

## Requirements

- Node.js 20+ และ npm
- MongoDB
- Google Maps API key สำหรับหน้าแผนที่
- Supabase project สำหรับ Realtime ตำแหน่งรถ
- Python 3 ถ้าต้องใช้ detector/YOLO

## Environment Setup

ทุกส่วนใช้ `.env` ที่ root ร่วมกัน ทั้ง Backend, GPS, Admin Web, Passenger Web และ Docker
สำหรับเครื่องใหม่ คัดลอกแม่แบบครั้งเดียวจาก root (ไม่คัดลอกทับไฟล์ที่กรอกค่าแล้ว):

```bash
cp .env.example .env
```

กรอกค่าของทีมในไฟล์นี้ โดย `VITE_*` เป็นค่าที่เปิดเผยในเว็บ ส่วนรหัส GPS, `SECRET_KEY` และ `SUPABASE_SECRET_KEY` ใช้เฉพาะ Backend

## Backend Setup

Backend ใช้ค่าจาก `backend-node/config.js` และ root `.env`

```bash
cd backend-node
npm install
node app.js
```

หลังรันแล้ว API จะอยู่ที่:

```text
http://localhost:5101
```

ตรวจสอบ Backend:

```bash
curl http://localhost:5101/health
```

ควรได้ `{"status":"ok"}`

ถ้าต้องสร้างบัญชี Admin สำหรับฐานข้อมูลทดสอบ ให้เปิด Terminal ใหม่จาก root project แล้วรัน:

```bash
node backend-node/seed/seed_admin.js
```

ค่าหลักของ Backend:

- `MONGO_URI` - MongoDB URI ค่าเริ่มต้นคือ `mongodb://localhost:27017/`
- `DB_NAME` - ชื่อ database ค่าเริ่มต้นคือ `shuttlebus_web_system`
- `SECRET_KEY` - secret สำหรับ JWT
- `SAVE_INTERVAL` - รอบเวลาบันทึกข้อมูล detector
- `SUPABASE_URL` - Project URL ของ Supabase
- `SUPABASE_SECRET_KEY` - Secret key สำหรับส่งข้อมูลจาก Backend เท่านั้น

URL กล้องของ detector ตั้งค่าแยกตามสถานีผ่าน Admin Web และเก็บใน `stations.cameraUrl`

## Admin Web

เปิด Terminal ใหม่:

```bash
cd admin-web
npm install
npm run dev
```

เปิดหน้า Admin Web ตาม URL ที่ Vite แสดง โดยปกติคือ:

```text
http://localhost:5173
```

ค่า env สำหรับ Admin Web ใน root `.env`:

```env
VITE_API_BASE_URL=http://localhost:5101
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

คำสั่งที่ใช้บ่อย:

```bash
npm run dev
npm run build
npm run preview
```

## User Web

โฟลเดอร์ `frontend-vue/` เป็น Vue 3 + Vite สำหรับผู้โดยสาร ไม่ต้องใช้ Flutter SDK และไม่ต้องล็อกอินเพื่อดูข้อมูลรถ

เปิด Terminal ใหม่:

```bash
cd frontend-vue
npm install
npm run dev
```

เปิดหน้า Passenger Web ตาม URL ที่ Vite แสดง โดยปกติคือ:

```text
http://localhost:5174
```

ค่า env สำหรับ Passenger Web ใน root `.env` (ใช้ร่วมกับ Admin Web):

```env
VITE_API_BASE_URL=http://localhost:5101
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

คำสั่งที่ใช้บ่อย:

```bash
npm run dev
npm run build
npm run preview
```

ถ้าทดสอบจากมือถือหรือเครื่องอื่น ให้เปลี่ยน `VITE_API_BASE_URL` จาก `localhost` เป็น IP หรือ domain ของเครื่องที่รัน Backend

## การตั้งค่าสถานะสถานี

Admin Web มีเมนู Settings สำหรับแก้ชื่อสถานะ สี/รหัส HEX และช่วงจำนวนคน รวมถึงเพิ่มสถานะ โดยใช้ค่าร่วมกันทุกสถานี เก็บใน MongoDB collection `settings`
ดูขั้นตอนการแก้ไข บันทึก และข้อจำกัดปัจจุบันใน [คู่มือ Admin Settings](docs/HANDBOOK.md#37-admin-settings)

## Supabase Realtime Setup

ข้อมูลรถยังเก็บใน MongoDB และ Node Backend เป็นผู้ดึง GPS แล้วส่งข้อมูลไป Supabase

1. ใส่ `SUPABASE_URL` และ `SUPABASE_SECRET_KEY` ใน root `.env`
2. ใส่ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_PUBLISHABLE_KEY` ใน root `.env` เดียวกันสำหรับทั้งสองเว็บ
3. เปิด `backend-node/sql/realtime.sql` แล้วนำไปรันใน Supabase SQL Editor ครั้งแรก
4. รีสตาร์ต Backend และ Vite หลังแก้ `.env`

ช่อง Realtime แบบ private ที่ใช้คือ `mfu-buses`: รถใช้ event `buses.updated` และข้อมูลจำนวนคน/สถานะสถานีของ User Web ใช้ `public.updated`
เว็บจะโหลดข้อมูลเริ่มต้นจาก `/api/buses/snapshot` แล้วรับข้อมูลใหม่ผ่าน WebSocket
User Web โหลดสถานีและเส้นทางครั้งแรกผ่าน `/api/public-data` แล้วรับจำนวนคน สี และชื่อสถานะที่เปลี่ยนผ่าน Realtime โดยใช้ version เพื่อไม่โหลด geometry ซ้ำโดยไม่จำเป็น
Admin Web ยังโหลดข้อมูลสถานีผ่าน API เดิม; รายงานและ detector ไม่ได้เปลี่ยนเป็น Broadcast
ถ้า Realtime หลุด ระบบจะกลับไปใช้ API fallback อัตโนมัติ

อ่านรายละเอียด protocol, สิทธิ์ และวิธีตรวจสอบได้ที่ [docs/REALTIME.md](docs/REALTIME.md)

## Run All Services Locally

เปิด MongoDB แล้วเปิด Terminal 3 แท็บ:

Terminal 1:

```bash
cd backend-node
npm install
node app.js
```

Terminal 2:

```bash
cd admin-web
npm install
npm run dev
```

Terminal 3:

```bash
cd frontend-vue
npm install
npm run dev
```

URL สำหรับเข้าใช้งาน:

- Backend API: `http://localhost:5101`
- Admin Web: `http://localhost:5173`
- Passenger Web: `http://localhost:5174`

## Docker Setup

ตั้งค่า root `.env` ก่อน แล้วรันจาก root project:

```bash
docker compose up -d --build
```

URL เมื่อรันด้วย Docker:

- Backend API: `http://localhost:5101`
- Admin Web: `http://localhost:8180`
- Passenger Web: `http://localhost:8181`
- MongoDB: `mongodb://localhost:27017`

ดูรายละเอียดเพิ่มเติมที่ [docs/DOCKER.md](docs/DOCKER.md)

## API Overview

Backend แบ่ง route หลักตามนี้:

- `/health` - ตรวจสอบสถานะ Backend
- `/auth` - Login, JWT authentication และการจัดการบัญชี
- `/station` - ข้อมูลสถานีและการจัดการสถานี
- `/api/routes` - ข้อมูลเส้นทางและการจัดการเส้นทาง
- `/api/public-data` - snapshot สถานี จำนวนคน และเส้นทางแบบมี version สำหรับ User Web
- `/api/settings/crowd-thresholds` - GET/PUT การตั้งค่าสถานะ ใช้ JWT ของ Admin
- `/api/buses` - ข้อมูลรถในรูปแบบ array
- `/api/buses/snapshot` - snapshot รถสำหรับ initial load และ Realtime fallback
- `/api/buses/gps-status` - สถานะ GPS และ Supabase สำหรับ Admin
- `/api/report` - รายงานและ feedback
- `/api/detector` - ข้อมูลและการควบคุม detector

## Development Notes

- ควรรัน MongoDB และ Backend ก่อนเปิด Admin Web หรือ Passenger Web
- ถ้าเปลี่ยนค่า `.env` ต้องหยุดแล้วรัน service นั้นใหม่
- ถ้าใช้ Secret key ของ Supabase ให้เก็บไว้เฉพาะ Backend และห้าม commit ลง Git
- ห้าม commit root `.env` ที่มี key จริง ใช้ `.env.example` เป็นแม่แบบสำหรับทีม
- Google Maps quota และ API key เป็นคนละส่วนกับ Supabase Realtime
- ข้อมูลสถานี รายงาน feedback และ detector ยังคงโหลดผ่าน API เดิม
- ถ้าใช้ GPS จริง ให้ตั้งค่า `GPS_*` ใน root `.env` ตาม [docs/GPS.md](docs/GPS.md)

## Documentation

- [docs/projectmap.md](docs/projectmap.md) - แผนที่โครงสร้าง repo และ source truth
- [docs/prd.md](docs/prd.md) - Product Requirements Document และ acceptance criteria
- [docs/agent.md](docs/agent.md) - System architecture และ workflow
- [docs/er.md](docs/er.md) - ER/logical relationship ของข้อมูล
- [docs/data.md](docs/data.md) - Data dictionary, schema และ backup
- [docs/HANDBOOK.md](docs/HANDBOOK.md) - คู่มือการใช้งานระบบ
- [docs/HANDOVER.md](docs/HANDOVER.md) - คู่มือส่งต่องานให้สมาชิกทีม
- [docs/REALTIME.md](docs/REALTIME.md) - Supabase Realtime, fallback และ troubleshooting
- [docs/GPS.md](docs/GPS.md) - การตั้งค่า GPS และตรวจข้อมูลรถ
- [docs/DOCKER.md](docs/DOCKER.md) - คู่มือรันด้วย Docker
- [docs/DEPLOY.md](docs/DEPLOY.md) - คู่มือขึ้นเซิร์ฟเวอร์จริง โดเมน HTTPS ย้ายข้อมูล และสำรองข้อมูล
- [docs/AI-WORKFLOW.md](docs/AI-WORKFLOW.md) - แนวทางทำงานกับ AI ใน repo
