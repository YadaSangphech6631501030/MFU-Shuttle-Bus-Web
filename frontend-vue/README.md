# MFU Shuttle Bus User Web App

Flutter Web สำหรับผู้ใช้งานระบบ MFU Shuttle Bus โดยคง UX/UI แบบ mobile app เดิมไว้เมื่อเปิดบน browser

## Requirements

- Flutter SDK
- Chrome หรือ browser สำหรับทดสอบเว็บ
- Backend API รันอยู่ที่ `http://localhost:5001` หรือ URL ที่กำหนดเอง

## Run Locally

```bash
flutter config --enable-web
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:5001
```

ถ้าไม่ส่ง `API_BASE_URL` แอปจะใช้ค่าเริ่มต้นสำหรับเว็บเป็น `http://localhost:5001`

## Build Web

```bash
flutter build web --release --dart-define=API_BASE_URL=http://localhost:5001
```

ผลลัพธ์จะอยู่ที่ `build/web/` และสามารถนำไปเสิร์ฟด้วย nginx หรือ static hosting ได้

## Docker

```bash
docker build \
  --build-arg API_BASE_URL=http://localhost:5001 \
  -t mfu-shuttle-bus-user-web .

docker run --rm -p 8081:80 mfu-shuttle-bus-user-web
```

เปิดใช้งานที่ `http://localhost:8081`
