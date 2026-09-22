# รัน MFU Shuttle Bus Web ด้วย Docker

อัปเดตตาม `docker-compose.yml` วันที่ 22 กันยายน 2026 ทั้ง Admin และ Passenger เป็น Vue/Vite

## เตรียมก่อนรัน

1. ติดตั้งและเปิด Docker Desktop หรือ Docker Engine พร้อม Compose
2. คัดลอก root `.env.example` เป็น `.env` เฉพาะเมื่อยังไม่มีไฟล์
3. กรอกค่าของทีมตาม [HANDOVER.md](HANDOVER.md) และตั้งสิทธิ์ Supabase ตาม [REALTIME.md](REALTIME.md)
4. ถ้าทำเฉพาะเว็บ ตั้ง `INSTALL_DETECTOR=false` ใน root `.env` เพื่อลด dependency Python/YOLO ตอน build

ค่า GPS อยู่ใน root `.env` ด้วย และถูกส่งเข้า Backend ผ่าน `env_file` ตอนรัน
อย่าเปิด local MongoDB/Node ค้างบนพอร์ตเดียวกับ Compose

## รันและหยุด

จาก root repository:

```bash
docker compose up -d --build
docker compose ps
```

| Service | URL/พอร์ตบนเครื่อง |
|---|---|
| backend | http://localhost:5101 |
| health | http://localhost:5101/health |
| admin-web | http://localhost:8180 |
| user-web | http://localhost:8181 |
| mongo | localhost:27017 |

ทั้งสองเว็บรันเป็น service ปกติ ไม่มี profile Flutter
Docker images ใช้ Node.js 22 เพื่อรองรับ Supabase SDK ที่ติดตั้งใน lockfile ซึ่งต้องการ Node.js >=22

```bash
docker compose logs -f backend
docker compose logs -f admin-web user-web
docker compose down
```

`down` ปกติเก็บ named volumes ไว้ ไม่ต้องเติม `-v` สำหรับการหยุดหรืออัปเดตโค้ด เพราะ `-v` ลบข้อมูลใน volumes

## อัปเดตโค้ดใน Docker โดยเก็บข้อมูลเดิม

เปิด Docker Desktop ให้พร้อมก่อน แล้วรันจาก root repository:

```bash
docker compose config --quiet
docker compose up -d --build backend admin-web user-web
docker compose ps
```

ถ้า Backend หรือ MongoDB แบบ local ใช้พอร์ต 5101/27017 อยู่ ให้หยุด service local ก่อนเปิดชุด Compose โดยตรวจให้แน่ใจว่าจะใช้ฐานข้อมูลชุดใด: MongoDB ใน Docker ใช้ named volume ของตัวเอง ไม่ได้อ่านฐาน local อัตโนมัติ
ถ้าต้องการสร้าง image ก่อนโดยยังไม่สลับระบบ ให้รัน `docker compose build backend admin-web user-web`

คำสั่งนี้ build จากโค้ดในเครื่องและ recreate service ที่เปลี่ยน โดยใช้ MongoDB volume เดิม ไม่ต้อง import demo หรือรัน seed ซ้ำ และไม่ใช้ `down -v`
การใช้เพียง `docker compose restart` จะไม่ build โค้ดใหม่หรือรับ environment ที่เปลี่ยน

เวอร์ชันปัจจุบันรวมหน้า Admin Settings และ `/api/public-data` ใน image อยู่แล้ว:

- Settings เก็บชื่อ สี และช่วงจำนวนคนใน collection `settings` ของ MongoDB เดิม ไม่ต้องสร้างตาราง Supabase เพิ่ม
- เส้นทางเก็บใน collection `routes`; Backend initialize ค่าเริ่มต้นเฉพาะรายการที่ยังไม่มี
- Backend ส่ง `buses.updated` และ `public.updated` ผ่าน private channel `mfu-buses` เดิม ถ้าตั้ง policy ตาม `backend-node/sql/realtime.sql` แล้ว ไม่ต้องเพิ่ม policy สำหรับ event ใหม่
- User Web รับจำนวนคนและสถานะผ่าน Realtime ส่วน Admin Web ยังโหลดข้อมูลสถานีผ่าน API เดิม

ก่อนอัปเดตระบบที่มีข้อมูลใช้งานจริง ให้สำรอง MongoDB รวม `settings` และ `routes` ด้วย
หลังอัปเดต เปิด Admin Settings ตรวจค่าที่บันทึก และเปิด User Web ตรวจชื่อ/สี/จำนวนคน หากหน้าเว็บยังแสดงรุ่นเก่าให้ reload หน้าเว็บ

## Environment

Compose, Backend และ Vite ทั้งสองเว็บอ่าน root `.env` ไฟล์เดียวกัน
Compose ส่งค่าฝั่ง Backend ผ่าน `env_file` และส่งเฉพาะค่าหน้าเว็บผ่าน build args โดยไม่คัดลอก `.env` เข้า image

| ตัวแปร | ผู้ใช้ค่า |
|---|---|
| `DB_NAME` | MongoDB/Node ค่าเริ่มต้น `shuttlebus_web_system` |
| `SECRET_KEY`, `SAVE_INTERVAL` | Node runtime |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Node runtime เท่านั้น |
| `GPS_*` | Node GPS worker |
| `VITE_API_BASE_URL` | build ทั้งสองเว็บ |
| `USER_WEB_API_BASE_URL` | optional override ของ API เว็บผู้โดยสารเฉพาะ Docker; ถ้าไม่กำหนดใช้ `VITE_API_BASE_URL` |
| `VITE_GOOGLE_MAPS_API_KEY` | build ทั้งสองเว็บ |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | build ทั้งสองเว็บ |
| `INSTALL_DETECTOR` | build Python/YOLO และกำหนด detector enabled |

Node ใน Compose ใช้ `mongodb://mongo:27017/` ตาม `docker-compose.yml` ถ้าจะใช้ฐานข้อมูลภายนอกต้องปรับ environment ของ service นั้น
API URL ของเว็บถูกใช้โดยเบราว์เซอร์ จึงห้ามใส่ `http://backend:5101` ซึ่งเป็นชื่อภายใน Docker
ถ้าเปิดจากมือถือ/เครื่องเพื่อน ให้ใช้ IP หรือโดเมนที่เบราว์เซอร์เข้าถึงได้แทน `localhost`

หลังเปลี่ยนค่าฝั่งหน้าเว็บ ต้อง rebuild:

```bash
docker compose up -d --build admin-web user-web
```

หลังเปลี่ยนค่าฝั่ง Node ใน root `.env` ให้ recreate service เพื่อรับ environment ใหม่:

```bash
docker compose up -d --force-recreate backend
```

หากแก้ source backend หรือ dependency ให้ใช้ `docker compose up -d --build backend`

## ฐานข้อมูลเริ่มต้น

เมื่อสร้าง MongoDB volume ใหม่ครั้งแรก จะรัน `docker/mongo-init/001-import-backup.sh`
นำเข้าข้อมูล demo จาก `docker/mongo-init/backup/` และสร้างบัญชี admin demo ตามสคริปต์
volume เดิมไม่ถูก import ซ้ำด้วยการ `up` ปกติ

อย่ารันสคริปต์ import ซ้ำกับฐานที่ใช้งานอยู่ เพราะมี `--drop` และเขียนทับบัญชี demo
ตรวจ/เปลี่ยนบัญชี demo ก่อนใช้งานจริง และสำรองข้อมูลก่อนงานย้ายฐาน
GPS จริงใช้ fleet registry กับข้อมูล `source: ppgps` ไม่ใช้รถจำลองจาก backup เป็นแหล่งตำแหน่งสด

## ตรวจหลังรัน

```bash
curl http://localhost:5101/health
curl http://localhost:5101/api/buses/snapshot
curl http://localhost:5101/api/public-data
docker compose exec backend node scripts/check-realtime.js
```

จากนั้นดู WebSocket ในเบราว์เซอร์ตาม [REALTIME.md](REALTIME.md)
ถ้า Supabase ไม่พร้อม เว็บยังใช้ API fallback; หาก Maps ไม่ขึ้นต้องตรวจ Google Maps key/referrer แยกกัน
