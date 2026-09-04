# MFU Shuttle Bus

ระบบ Shuttle Bus สำหรับมหาวิทยาลัย ประกอบด้วย Backend API, หน้า Admin Web และ User Web App ที่ build จาก Flutter Web

## Project Structure

- `backend-node/` - Backend API ด้วย Node.js, Express และ MongoDB
- `admin-web/` - หน้าเว็บผู้ดูแลระบบด้วย Vue 3 และ Vite
- `frontend-vue/` - User Web App ด้วย Flutter Web โดยคง UX/UI แบบ mobile app เดิม

## Main Features

- จัดการสถานี shuttle bus และข้อมูลกล้อง CCTV
- Dashboard สำหรับดูภาพรวมระบบ แผนที่สถานี และ crowd alerts
- หน้า Buses สำหรับดูและจัดการสถานะรถออนไลน์/ออฟไลน์/จำนวนรถทั้งหมด
- แอปผู้ใช้สำหรับเลือก From/To station ดูเส้นทางรถ และบันทึกสถานีโปรด
- ระบบรายงานปัญหาและ feedback พร้อมหน้า Reports สำหรับผู้ดูแลระบบ
- รองรับภาษาอังกฤษและภาษาไทยในแอปผู้ใช้และ Admin Web

## Requirements

- Node.js และ npm
- MongoDB
- Flutter SDK พร้อม Web support
- Google Maps API key สำหรับหน้าแผนที่
- Python 3 ถ้าต้องใช้ detector script

## Backend Setup

Backend ใช้ค่าเริ่มต้นจาก `backend-node/config.js`

```bash
cd backend-node
npm install
node app.js
```

หลังรันแล้ว API จะอยู่ที่

```text
http://localhost:5001
```

ค่าหลักใน `backend-node/config.js`

- `MONGO_URI` - MongoDB URI ค่าเริ่มต้นคือ `mongodb://localhost:27017/`
- `DB_NAME` - ชื่อ database ค่าเริ่มต้นคือ `shuttlebus_system`
- `SECRET_KEY` - secret สำหรับ JWT
- `CAMERA_URL` - URL กล้องสำหรับ detector
- `SAVE_INTERVAL` - รอบเวลาบันทึกข้อมูล detector

## Admin Web Setup

```bash
cd admin-web
npm install
cp .env.example .env
npm run dev
```

ค่า env ที่ใช้ใน `admin-web/.env`

```env
VITE_API_BASE_URL=http://localhost:5001
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```

คำสั่งที่ใช้บ่อย

```bash
npm run dev
npm run build
npm run preview
```

## User Web App Setup

โฟลเดอร์ `frontend-vue/` เป็น Flutter Web สำหรับผู้ใช้งาน โดยยังคง layout และ UX/UI แบบ mobile app เดิมเมื่อเปิดบน browser

```bash
cd frontend-vue
flutter pub get
flutter config --enable-web
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:5001
```

หลังรันแล้ว user web app จะเปิดใน Chrome โดยเชื่อม Backend ที่

```text
http://localhost:5001
```

ถ้าไม่ส่ง `--dart-define=API_BASE_URL=...` ระบบจะใช้ค่าเริ่มต้นสำหรับเว็บเป็น `http://localhost:5001`

คำสั่ง build สำหรับ deploy เป็น static web

```bash
cd frontend-vue
flutter build web --release --dart-define=API_BASE_URL=http://localhost:5001
```

ไฟล์ที่ build แล้วจะอยู่ที่ `frontend-vue/build/web/`

## Docker Setup

รันทั้ง Backend, Admin Web และ User Web App ด้วย Docker Compose

```bash
docker compose --profile flutter-web up --build
```

URL สำหรับเข้าใช้งาน

- Backend API: `http://localhost:5001`
- Admin Web: `http://localhost:8080`
- User Web App: `http://localhost:8081`

ค่า env ที่ใช้กับ User Web App ตอน build Docker

```env
FLUTTER_API_BASE_URL=http://localhost:5001
```

ตัวอย่างรันพร้อมกำหนด API URL

```bash
FLUTTER_API_BASE_URL=http://localhost:5001 docker compose --profile flutter-web up --build
```

## API Overview

Backend แบ่ง route หลักตามนี้

- `/auth` - Admin login, JWT authentication และการจัดการบัญชีผ่าน Admin Web
- `/station` - ข้อมูลสถานีและการจัดการสถานี
- `/api/buses` - ข้อมูลรถ shuttle bus
- `/api/report` - รายงาน
- `/api/detector` - ข้อมูลจาก detector

## Development Notes

- ควรรัน MongoDB และ backend ก่อนเปิด Admin Web หรือ User Web App
- ถ้าทดสอบจากเครื่องอื่นในวง LAN ให้เปลี่ยน API URL จาก `localhost` เป็น IP เครื่องที่รัน backend
- ถ้ารันด้วย Docker ให้ดูรายละเอียดใน `docs/DOCKER.md`
- อย่า commit ไฟล์ local config ที่มี key จริง เช่น `admin-web/.env` หรือ `frontend-vue/ios/Flutter/GoogleMaps.xcconfig`
- ไฟล์ build/cache เช่น `node_modules/`, `.dart_tool/` และ `build/` ไม่ควรนำเข้า git

## Documentation

- `docs/projectmap.md` - แผนที่โครงสร้าง repo และไฟล์ source truth สำหรับหาบั๊กหรือให้ AI อ่านต่อ
- `docs/prd.md` - Product Requirements Document และ acceptance criteria
- `docs/agent.md` - System/agent architecture และ workflow สำหรับ AI/agent
- `docs/er.md` - ER/logical relationship ของ MongoDB collections
- `docs/data.md` - Data dictionary, schema, indexes, seed และ backup
- `docs/HANDBOOK.md` - คู่มือการใช้งานระบบสำหรับ user, admin และผู้ดูแลระบบ
- `docs/HANDOVER.md` - checklist สำหรับเตรียมส่งมอบระบบ
- `docs/DOCKER.md` - คู่มือรันระบบด้วย Docker
- `docs/AI-WORKFLOW.md` - กติกาการให้ AI/agent ทำงานกับ repo นี้
