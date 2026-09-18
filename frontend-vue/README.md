# MFU Shuttle Bus User Web

Vue 3 + Vite สำหรับผู้ใช้งานระบบ MFU Shuttle Bus โดยคง UX/UI แบบ mobile app เดิมไว้เมื่อเปิดบน browser

## Requirements

- Node.js และ npm
- Backend API รันอยู่ที่ `http://localhost:5101` หรือ URL ที่กำหนดเอง

## Environment

ใช้ `.env` ที่ root ร่วมกับ Backend และ Admin Web จากโฟลเดอร์ `frontend-vue` คัดลอกแม่แบบเฉพาะเมื่อยังไม่มีไฟล์:

```bash
cp ../.env.example ../.env
```

ค่าเริ่มต้นใน root `.env` (Vite อ่านผ่าน `envDir`)

```env
VITE_API_BASE_URL=http://localhost:5101
```

## Run Locally

```bash
npm install
npm run dev
```

เปิดใช้งานที่ URL ที่ Vite แสดงใน terminal โดยปกติคือ `http://localhost:5173`

## Build Web

```bash
npm run build
```

ผลลัพธ์จะอยู่ที่ `dist/` และสามารถนำไปเสิร์ฟด้วย nginx หรือ static hosting ได้

## Docker

```bash
docker build \
  --build-arg VITE_API_BASE_URL=http://localhost:5101 \
  -t mfu-shuttle-bus-user-web .

docker run --rm -p 8181:80 mfu-shuttle-bus-user-web
```

เปิดใช้งานที่ `http://localhost:8181`
