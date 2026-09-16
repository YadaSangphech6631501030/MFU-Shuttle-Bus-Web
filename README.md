# MFU Shuttle Bus Web

ระบบรถรับส่งมหาวิทยาลัยแม่ฟ้าหลวง: เว็บผู้โดยสารและแอดมินด้วย Vue 3, หลังบ้าน Node.js/Express, MongoDB และ Supabase Realtime สำหรับข้อมูลรถ

## เริ่มต้นสำหรับสมาชิกทีม

อ่าน **[คู่มือรับช่วงพัฒนา](docs/HANDOVER.md)** ก่อน มีขั้นตอนเตรียมเครื่อง, `.env`, บัญชีทดสอบ และคำสั่งรันครบ
ข้อมูลจริงและบัญชีของทีมต้องรับผ่านช่องทางส่วนตัว ไม่อยู่ใน repository

## โครงสร้างและความสามารถ

| ส่วน | โฟลเดอร์ | หน้าที่ |
|---|---|---|
| Backend | `backend-node/` | REST API, Node JWT, GPS worker, MongoDB, detector |
| Passenger | `frontend-vue/` | Google Map, ตำแหน่งรถ, ETA, From/To, Favorites, feedback, TH/EN |
| Admin | `admin-web/` | Dashboard, สถานี, สายรถ, GPS status, รายงาน, บัญชี และ CCTV |
| Realtime | Node → Supabase → Vue | อัปเดตตำแหน่ง/สถานะรถ พร้อม API fallback |

MongoDB เป็นฐานข้อมูลหลัก Supabase ใช้ Broadcast โดยไม่ต้องย้ายข้อมูลไป Postgres หรือสร้าง Storage Bucket
ข้อมูลสถานี เส้นทาง รายงาน และ detector ยังโหลดผ่าน API ตามเดิม

## รันแบบ local

ติดตั้ง Node.js/npm และเปิด MongoDB ก่อน คำสั่งทดสอบ TypeScript ต้องใช้ Node ที่รองรับ type stripping เช่น 22.6+
Python/YOLO ใช้เฉพาะเมื่อต้องเปิด detector จริง

จาก root repository ติดตั้ง dependencies:

```bash
npm ci --prefix backend-node
npm ci --prefix admin-web
npm ci --prefix frontend-vue
```

เตรียมไฟล์ `.env` ทั้งสามตำแหน่งและ `.env.gps` ตาม [HANDOVER.md](docs/HANDOVER.md#3-เตรียมไฟล์ตั้งค่า) ก่อนรัน
อย่าคัดลอกไฟล์ตัวอย่างทับค่าที่กรอกไว้แล้ว

เปิด Terminal แยกสามแท็บ โดยทุกคำสั่งเริ่มจาก root:

```bash
node backend-node/app.js
```

```bash
npm --prefix admin-web run dev -- --port 5173 --strictPort
```

```bash
npm --prefix frontend-vue run dev -- --port 5174 --strictPort
```

| ส่วน | Local | Docker |
|---|---|---|
| Backend | http://localhost:5101 | http://localhost:5101 |
| Admin | http://localhost:5173 | http://localhost:8180 |
| Passenger | http://localhost:5174 | http://localhost:8181 |

Backend ไม่มี `npm run dev`; ใช้ `node backend-node/app.js`
หากใช้ `npm run dev` โดยไม่ระบุพอร์ต Vite อาจเลือกพอร์ตถัดไป ให้ดู URL ใน Terminal

## Supabase และ GPS

1. ตั้งค่า GPS ที่ `backend-node/.env.gps` ตาม [GPS.md](docs/GPS.md)
2. ใส่ `SUPABASE_URL`/`SUPABASE_SECRET_KEY` ใน root `.env` สำหรับ backend
3. ใส่ `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` ใน `.env` ของเว็บทั้งสอง
4. รัน [SQL สิทธิ์ Realtime](backend-node/sql/realtime.sql) ใน Supabase SQL Editor ครั้งแรก
5. รีสตาร์ตโปรแกรมที่เปลี่ยน env และตรวจตาม [REALTIME.md](docs/REALTIME.md)

ต้องใช้ Secret key เฉพาะ backend; `.env.example` เก็บ placeholders เท่านั้น
เว็บโหลด snapshot ครั้งแรกและหลัง reconnect จากนั้นรับ `buses.updated` ผ่านช่องส่วนตัว `mfu-buses`
หากไม่มี event เกิน 15 วินาทีหรือเชื่อมต่อไม่ได้ จะโหลด API สำรองทุก 5 วินาที

## Docker

เตรียม root `.env` และ `backend-node/.env.gps` แล้วรัน:

```bash
docker compose up -d --build
```

อ่าน [DOCKER.md](docs/DOCKER.md) สำหรับ environment, rebuild และ volumes
เลือกใช้ local หรือ Docker โดยไม่เปิด service ซ้อนพอร์ตเดียวกัน

## ตรวจสอบ

```bash
curl http://localhost:5101/health
node backend-node/scripts/check-realtime.js
npm --prefix frontend-vue run build
npm --prefix admin-web run build
```

`check-realtime.js` ยืนยันเฉพาะตัวส่ง; ตรวจการรับจริงและคำสั่ง tests ใน [REALTIME.md](docs/REALTIME.md#คำสั่งตรวจสอบโค้ด)

## เอกสาร

- [HANDOVER.md](docs/HANDOVER.md) — เพื่อนรับงานเริ่มที่นี่
- [HANDBOOK.md](docs/HANDBOOK.md) — วิธีใช้งานหน้าเว็บ
- [REALTIME.md](docs/REALTIME.md) — Supabase, protocol, fallback, troubleshooting และงานที่ต่อยอดได้
- [GPS.md](docs/GPS.md) — ตั้งค่าผู้ให้บริการและความสดของข้อมูล
- [projectmap.md](docs/projectmap.md) — หาไฟล์ที่จะพัฒนาต่อ
- [DOCKER.md](docs/DOCKER.md) — รันด้วย containers
- [agent.md](docs/agent.md) — architecture และแนวทางอ่านโค้ด
- [prd.md](docs/prd.md) — ขอบเขตและ requirement
- [data.md](docs/data.md), [er.md](docs/er.md) — ข้อมูลและความสัมพันธ์
- [AI-WORKFLOW.md](docs/AI-WORKFLOW.md) — แนวทางทำงานกับ AI ใน repo
