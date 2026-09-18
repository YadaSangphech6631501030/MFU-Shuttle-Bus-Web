# ตั้งค่า GPS รถจริง

ข้อมูลรถปัจจุบันมาจาก GPS worker ใน Node และเก็บ MongoDB ไม่ได้เรียกผู้ให้บริการ GPS จากเบราว์เซอร์

## ตั้งค่า

คัดลอก root `.env.example` เป็น `.env` หากยังไม่มีไฟล์ แล้วกรอกส่วน `GPS_*` ด้วยบัญชีที่ได้รับจากทีม
Backend, scripts และ Docker อ่านค่าจาก root `.env` ร่วมกัน

| ตัวแปร | ความหมาย |
|---|---|
| `GPS_ENABLED` | `false` เพื่อหยุด worker ในเครื่องที่ทำ UI อย่างเดียว |
| `GPS_BASE_URL` | URL ผู้ให้บริการตามค่าตัวอย่าง/สภาพแวดล้อมของทีม |
| `GPS_USERNAME`, `GPS_PASSWORD` | บัญชี GPS ของทีม ไม่ commit |
| `GPS_POLL_SECONDS` | รอบดึงข้อมูล ค่าเริ่มต้น 5 วินาที และมีขั้นต่ำ 5 วินาที |
| `GPS_TIMEOUT_SECONDS` | timeout ผู้ให้บริการ ค่าเริ่มต้น 15 วินาที |
| `GPS_STALE_SECONDS` | เกณฑ์ freshness ค่าเริ่มต้น 30 วินาที |
| `GPS_SPEED_UNIT` | `unknown` จนกว่าจะยืนยันหน่วยจริง; รองรับ `kmh`, `mph`, `knots` |

รายชื่อรถและการจับคู่ device อยู่ที่ `backend-node/config/gps-fleet.json`
`line: null` ไม่ได้ห้ามคำนวณ ETA ฝั่งผู้โดยสาร; โค้ดพิจารณารถที่กำลังจะถึงตามเส้นทาง ทิศทาง ความสด และความเร็ว
ถ้าความเร็ว/ทิศทางไม่พร้อม บางกรณีใช้สอง GPS fixes ประเมินการเคลื่อนที่ ต้องรอข้อมูลจริง ไม่เติมความเร็วสมมติ

## ตรวจแบบอ่านอย่างเดียว

จาก root:

```bash
npm --prefix backend-node run check:gps
```

คำสั่งนี้ติดต่อผู้ให้บริการและรายงานจำนวนรถที่จับคู่ได้ โดยไม่เขียน MongoDB และไม่พิมพ์พิกัดหรือ credentials
ไม่ได้เปิด worker แทน `node backend-node/app.js`

## ตรวจบนเว็บ

- `GET /api/buses` คืนรถใน registry พร้อม health/freshness และพิกัดล่าสุดที่มี
- `GET /api/buses/snapshot` คืนข้อมูลพร้อม version สำหรับ Realtime
- แอดมินดู `GET /api/buses/gps-status` ผ่าน Network หลังล็อกอินได้
- API มีข้อมูลรถไม่ได้แปลว่าพิกัดสดเสมอ ต้องดู `feedHealthy`, `connectionStatus` และ `lastGpsAt`
- ETA ฝั่งผู้โดยสารมีเกณฑ์อายุ GPS ของตัวเองที่ 30 วินาที ปรับ `GPS_STALE_SECONDS` ฝั่ง Node อย่างเดียวไม่ได้เปลี่ยนเกณฑ์ ETA

หาก GPS ไม่พร้อม ระบบไม่ควรสร้างตำแหน่งหรือ ETA ปลอม รายละเอียดการส่งต่อไป Supabase อยู่ใน [REALTIME.md](REALTIME.md)
ใช้ worker หนึ่งตัวต่อสภาพแวดล้อม เพื่อไม่ให้หลายเครื่องดึง GPS และส่งข้อมูลรถคนละชุดเข้าช่องเดียวกัน
