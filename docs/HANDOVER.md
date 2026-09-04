# MFU Shuttle Bus Handover Checklist

เอกสารนี้เป็น checklist สำหรับเตรียมส่งมอบระบบ MFU Shuttle Bus

## 1. ไฟล์ที่ควรส่งมอบ

- Source code ทั้ง repository
- `README.md`
- `docs/projectmap.md`
- `docs/prd.md`
- `docs/agent.md`
- `docs/er.md`
- `docs/data.md`
- `docs/HANDBOOK.md`
- `docs/DOCKER.md`
- `docs/HANDOVER.md`
- `docs/AI-WORKFLOW.md`
- `.env.example` หรือไฟล์ตัวอย่าง environment
- รายการบัญชีสำหรับทดสอบ
- Screenshot หรือวิดีโอ demo ถ้าต้องส่งประกอบรายงาน

## 2. สิ่งที่ไม่ควรส่งมอบ

- `node_modules/`
- `.dart_tool/`
- `build/`
- `dist/` ถ้าไม่ได้ต้องการส่ง build artifact
- `.env` ที่มี key จริง
- Google Maps API key จริงในเอกสารสาธารณะ
- MongoDB volume หรือข้อมูลส่วนตัวที่ไม่จำเป็น

## 3. Environment ที่ต้องเตรียม

เครื่องที่จะรันระบบควรมี

- Node.js และ npm
- MongoDB หรือ Docker Desktop
- Flutter SDK สำหรับรัน mobile app
- Google Maps API key
- Browser สำหรับ Admin Web

## 4. ขั้นตอนรันระบบแบบ Manual

### 4.1 รัน MongoDB

เปิด MongoDB local หรือใช้ Docker ตาม `docs/DOCKER.md`

### 4.2 รัน Backend

```bash
cd backend-node
npm install
node app.js
```

### 4.3 Seed ข้อมูลตัวอย่าง

```bash
cd backend-node
node seed/seed_station.js
node seed/seed_bus.js
```

### 4.4 รัน Admin Web

```bash
cd admin-web
npm install
cp .env.example .env
npm run dev
```

### 4.5 รัน Flutter App

```bash
cd frontend-vue
flutter pub get
flutter run
```

## 5. ขั้นตอนรันระบบแบบ Docker

จาก root project

```bash
docker compose up -d --build
```

เปิดใช้งาน

- Backend API: `http://localhost:5001`
- Admin Web: `http://localhost:8080`
- MongoDB: `localhost:27017`

## 6. บัญชีทดสอบ

ถ้ารันด้วย Docker และใช้ backup ตัวอย่าง

```text
username: admin
password: 12345678
```

ถ้ารันแบบ manual ให้ตรวจสอบข้อมูล admin ใน MongoDB หรือสร้าง user admin ตามข้อมูลจริงของผู้ส่งมอบ

## 7. Checklist ทดสอบก่อนส่ง

### Backend

- API เปิดได้
- MongoDB เชื่อมต่อได้
- Seed station และ bus สำเร็จ
- `/health` ใช้งานได้ถ้าเปิดผ่าน Docker

### Admin Web

- Login admin ได้
- Dashboard แสดงข้อมูล
- Dashboard แสดง live station map, crowd alerts และ dispatch guide
- Station Setting เพิ่ม แก้ ลบสถานีได้
- Buses แสดงข้อมูลรถได้
- Reports แสดง active report, feedback และ history ได้
- Feedback ไม่ต้องมีสถานะ pending และ History report แสดงเป็น resolved เท่านั้น
- เปลี่ยนสถานะ report ได้
- เปลี่ยนภาษา EN/TH แล้วข้อความเปลี่ยนถูกต้อง

### Flutter App

- เปิดแอปได้
- แผนที่แสดงผล
- ปุ่มภาษาเปลี่ยน EN/TH ได้
- เลือก From/To station ได้
- เส้นทางไม่ย้อนศรในกรณีสถานี outbound
- ไม่สามารถเลือกสถานีต้นทางและปลายทางซ้ำกันได้
- เพิ่ม Favorite station ได้
- ส่ง report ได้
- ส่ง feedback ได้

### Documentation

- `docs/projectmap.md` อธิบาย directory/file map ครบ
- `docs/prd.md` อธิบาย requirement และ acceptance criteria
- `docs/agent.md` อธิบาย architecture และ workflow สำหรับ AI/agent
- `docs/er.md` อธิบาย logical ER ของ collections หลัก
- `docs/data.md` อธิบาย schema, index, seed และ backup data
- `README.md`, `HANDBOOK.md`, `HANDOVER.md`, `DOCKER.md` link ไปยังเอกสารสำคัญครบ

## 8. Known Issues / ข้อจำกัด

- ถ้าไม่มี translation API ระบบจะไม่แปลข้อความ report ที่ผู้ใช้พิมพ์เองแบบอัตโนมัติ
- ถ้า Google Maps API key ไม่ถูกต้อง แผนที่จะไม่แสดง
- ถ้าใช้มือถือจริงต้องเปลี่ยน API URL จาก `localhost` เป็น IP ของเครื่อง backend
- Detector/CCTV ต้องตั้งค่า camera URL ให้ตรงกับสภาพแวดล้อมจริง
- ไฟล์ build/cache เช่น `frontend-vue/build/` และ `frontend-vue/.dart_tool/` ไม่ควรรวมใน commit ส่งมอบ

## 9. คำสั่งตรวจสอบก่อนส่ง

```bash
git status
```

Admin Web

```bash
cd admin-web
npm run build
```

Flutter

```bash
cd frontend-vue
flutter analyze
```

Backend

```bash
cd backend-node
node --check app.js
```

## 10. สรุปสำหรับผู้รับระบบ

ระบบนี้ประกอบด้วย Backend API, Admin Web และ Flutter App ผู้รับระบบควรเริ่มจากอ่าน `README.md` และ `docs/projectmap.md` เพื่อเข้าใจโครงสร้าง อ่าน `docs/prd.md`, `docs/er.md`, `docs/data.md` เพื่อเข้าใจ requirement/database อ่าน `docs/HANDBOOK.md` เพื่อใช้งานระบบ และอ่าน `docs/DOCKER.md` ถ้าต้องการรันด้วย Docker
