# Docker Guide for MFU Shuttle Bus

เอกสารนี้ใช้สำหรับ build image และรันโปรเจ็คด้วย Docker

## สิ่งที่ Docker จะรัน

- `mongo` - MongoDB database
- `backend` - Node.js/Express API ที่ port `5001`
- `admin-web` - Vue/Vite admin web ที่เสิร์ฟด้วย Nginx ที่ port `8080`
- `flutter-web` - Flutter web version ที่ port `8081` แบบ optional profile

หมายเหตุ: โฟลเดอร์ `frontend-vue` เป็น Flutter app ไม่ใช่ Vue app ตามชื่อโฟลเดอร์ ถ้าจะทำ Android/iOS ยังต้องใช้ Flutter SDK build ตามปกติ ส่วน Dockerfile ที่เพิ่มให้ใช้ build เป็น Flutter Web

## ไฟล์ที่เพิ่ม/แก้สำหรับ Docker

- `docker-compose.yml`
- `docker/mongo-init/001-import-backup.sh`
- `docker/mongo-init/backup/*.json`
- `.env.example`
- `backend-node/Dockerfile`
- `backend-node/.dockerignore`
- `backend-node/python/requirements.txt`
- `admin-web/Dockerfile`
- `admin-web/.dockerignore`
- `admin-web/nginx.conf`
- `frontend-vue/Dockerfile`
- `frontend-vue/.dockerignore`
- `frontend-vue/nginx.conf`

มีการแก้ backend ให้รับค่าจาก environment ด้วย เช่น `MONGO_URI`, `DB_NAME`, `SECRET_KEY`, `PORT`, `CAMERA_URL`, `SAVE_INTERVAL`, `INSTALL_DETECTOR`

## เตรียมเครื่อง

ต้องติดตั้ง Docker Desktop และเปิด Docker Desktop ก่อนรันคำสั่ง

ตรวจสอบว่า Docker ใช้ได้:

```powershell
docker --version
docker compose version
```

## วิธีรันทั้งระบบแบบเร็ว

จาก root project:

```powershell
docker compose up -d --build
```

ถ้าเป็นเครื่องใหม่หรือ MongoDB volume ยังว่างอยู่ Docker จะ import backup จาก `docker/mongo-init/backup` เข้า database ให้อัตโนมัติ โดยมี collections:

- `buses`
- `reports`
- `stations`
- `users`

ระบบจะสร้าง admin สำรองให้ด้วย:

```text
username: admin
password: 12345678
```

หลังรันเสร็จ เปิดใช้งานได้ที่:

- Backend API: `http://localhost:5001`
- Backend healthcheck: `http://localhost:5001/health`
- Admin Web: `http://localhost:8080`
- MongoDB: `localhost:27017`

เช็คสถานะ container:

```powershell
docker compose ps
```

ดู log:

```powershell
docker compose logs -f backend
docker compose logs -f admin-web
docker compose logs -f mongo
```

หยุดระบบ:

```powershell
docker compose down
```

ถ้าต้องการลบ database volume ด้วย ใช้คำสั่งนี้อย่างระวัง เพราะข้อมูล MongoDB จะหาย:

```powershell
docker compose down -v
```

## ตั้งค่า environment

สามารถ copy ไฟล์ตัวอย่าง:

```powershell
Copy-Item .env.example .env
```

ค่าที่สำคัญ:

```env
DB_NAME=shuttlebus_system
SECRET_KEY=change_this_secret_before_real_deploy
CAMERA_URL=http://192.168.110.234:4747/video
SAVE_INTERVAL=5
VITE_API_BASE_URL=http://localhost:5001
VITE_GOOGLE_MAPS_API_KEY=
FLUTTER_API_BASE_URL=http://localhost:5001
```

ถ้าแก้ `VITE_API_BASE_URL` หรือ `VITE_GOOGLE_MAPS_API_KEY` ต้อง build `admin-web` ใหม่ เพราะ Vite ฝังค่านี้ตอน build:

```powershell
docker compose build admin-web
docker compose up -d admin-web
```

## Seed ข้อมูลเริ่มต้น

โปรเจกต์มี backup JSON สำหรับ import อัตโนมัติอยู่ที่:

```text
docker/mongo-init/backup/
```

MongoDB official image จะรันไฟล์ใน `docker/mongo-init/001-import-backup.sh` เฉพาะตอนสร้าง database volume ใหม่ครั้งแรกเท่านั้น ถ้าเครื่องมี `mongo-data` volume อยู่แล้ว การรัน `docker compose up` จะไม่ import ซ้ำ เพื่อไม่ให้ข้อมูลเดิมถูกเขียนทับ

ถ้าต้องการ re-import backup เข้า database เดิม ให้ระวังว่าคำสั่งนี้จะ `drop` collections ที่ import แล้วใส่ข้อมูลจาก backup ใหม่:

```powershell
docker compose exec mongo /docker-entrypoint-initdb.d/001-import-backup.sh
```

ถ้าต้องการเริ่ม database ใหม่ทั้งหมด ใช้คำสั่งนี้อย่างระวัง เพราะข้อมูล MongoDB เดิมจะหาย:

```powershell
docker compose down -v
docker compose up -d --build
```

หลัง container รันแล้ว สามารถ seed station และ bus ได้:

```powershell
docker compose exec backend node seed/seed_station.js
docker compose exec backend node seed/seed_bus.js
```

## Build image แยกทีละตัว

Backend:

```powershell
docker build -t mfu-shuttle-bus-backend:latest ./backend-node
```

Backend พร้อม detector/YOLO:

```powershell
docker build `
  -t mfu-shuttle-bus-backend:detector `
  --build-arg INSTALL_DETECTOR=true `
  ./backend-node
```

Admin Web:

```powershell
docker build `
  -t mfu-shuttle-bus-admin-web:latest `
  --build-arg VITE_API_BASE_URL=http://localhost:5001 `
  --build-arg VITE_GOOGLE_MAPS_API_KEY= `
  ./admin-web
```

Flutter Web:

```powershell
docker build `
  -t mfu-shuttle-bus-flutter-web:latest `
  --build-arg API_BASE_URL=http://localhost:5001 `
  ./frontend-vue
```

## รัน Flutter Web ด้วย Docker Compose

Flutter web ถูกแยกไว้เป็น profile เพราะ image ใหญ่และ build นาน:

```powershell
docker compose --profile flutter-web up -d --build
```

เปิดที่:

```text
http://localhost:8081
```

## Build แล้วดู image

```powershell
docker images
```

ควรเห็น image เช่น:

```text
mfu-shuttle-bus-backend
mfu-shuttle-bus-admin-web
mfu-shuttle-bus-flutter-web
```

## ทดสอบ API หลังรัน

PowerShell:

```powershell
Invoke-RestMethod http://localhost:5001/health
```

ผลลัพธ์ที่ควรได้:

```json
{
  "status": "ok"
}
```

## Troubleshooting: Docker Desktop containerd panic/SIGBUS

ถ้า Docker Desktop ขึ้น error แนวนี้:

```text
service containerd failed: panic detected in containerd
SIGBUS: bus error
```

ให้ลองตามลำดับนี้:

```powershell
wsl --shutdown
```

จากนั้นเปิด Docker Desktop ใหม่ แล้วเช็ค:

```powershell
docker version
docker compose config
```

ถ้า Docker กลับมาแล้ว แต่เคย crash ระหว่าง build image ใหญ่ ให้ล้าง build cache ที่ค้างได้:

```powershell
docker builder prune
```

แล้ว build ใหม่โดยใช้ค่า default ที่เบากว่า:

```powershell
docker compose build backend admin-web
docker compose up -d
```

ถ้ายัง crash อยู่ ให้เปิด Docker Desktop แล้วใช้เมนู `Troubleshoot` > `Restart Docker Desktop`

ตัวเลือก `Reset to factory defaults` เป็นทางสุดท้าย เพราะจะลบ images, containers และ volumes ของ Docker Desktop

## หมายเหตุเรื่อง localhost

ใน browser ของเครื่องเรา ใช้ `http://localhost:5001` ได้ เพราะ browser อยู่บนเครื่อง host

แต่ใน container backend จะต่อ MongoDB ด้วยชื่อ service คือ:

```text
mongodb://mongo:27017/
```

จุดนี้ถูกตั้งไว้ใน `docker-compose.yml` แล้ว

## หมายเหตุเรื่อง detector

ค่าเริ่มต้น `INSTALL_DETECTOR=true` เพื่อให้ backend image build พร้อม CCTV/YOLO detector ทันที

ให้ตั้งค่าใน `.env`:

```env
INSTALL_DETECTOR=true
```

แล้ว build backend ใหม่:

```powershell
docker compose build backend
docker compose up -d backend
```

เมื่อเปิด `INSTALL_DETECTOR=true` backend Docker image จะติดตั้ง Python package สำหรับ detector:

- CPU-only `torch` และ `torchvision`
- `ultralytics`
- `opencv-python-headless`
- `numpy`
- `pymongo`

Dockerfile ติดตั้ง PyTorch แบบ CPU-only ก่อน เพื่อลดโอกาสที่ pip จะดึง CUDA dependency ขนาดใหญ่มาโดยไม่จำเป็น แต่การ build backend image ยังอาจใช้เวลานานและใช้พื้นที่เยอะกว่างาน Node.js ปกติ เพราะต้องติดตั้ง dependency ของ YOLO
