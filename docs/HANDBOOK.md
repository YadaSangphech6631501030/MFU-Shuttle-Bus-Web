# MFU Shuttle Bus System Handbook

คู่มือนี้อธิบายวิธีใช้งานระบบ MFU Shuttle Bus สำหรับผู้ใช้งานทั่วไป ผู้ดูแลระบบ และผู้ดูแลการติดตั้งระบบ

## 1. ภาพรวมระบบ

ระบบ MFU Shuttle Bus แบ่งเป็น 3 ส่วนหลัก

- `frontend-vue/` เว็บ Vue 3 สำหรับผู้ใช้ทั่วไป
- `admin-web/` เว็บผู้ดูแลระบบ
- `backend-node/` Backend API และฐานข้อมูล MongoDB

ผู้ใช้ทั่วไปใช้แอปเพื่อดูเส้นทางรถ เลือกสถานีต้นทาง/ปลายทาง บันทึกสถานีโปรด ส่งรายงานปัญหา และส่ง feedback ส่วนผู้ดูแลระบบใช้ Admin Web เพื่อดู dashboard จัดการสถานี จัดการรถ ตรวจรายงาน และดู feedback

เอกสารประกอบสำหรับเตรียมสอบและส่งมอบ:

- `docs/projectmap.md` แผนที่โครงสร้างโปรเจกต์
- `docs/prd.md` Product Requirements Document
- `docs/agent.md` System/agent architecture
- `docs/er.md` ER/logical relationship
- `docs/data.md` Data dictionary
- `docs/HANDOVER.md` Checklist ส่งมอบ
- `docs/DOCKER.md` คู่มือ Docker

## 2. คู่มือผู้ใช้งานแอป

### 2.1 หน้า Home

หน้า Home ใช้สำหรับดูแผนที่รถ shuttle bus และเลือกเส้นทาง

วิธีใช้งาน

1. เปิดแอป MFU Shuttle Bus
2. กดช่อง `From station` เพื่อเลือกสถานีต้นทาง
3. กดช่อง `To station` เพื่อเลือกสถานีปลายทาง
4. ระบบจะแสดงเส้นทาง เวลาโดยประมาณ และข้อมูลรถที่ใกล้สถานีต้นทาง
5. กดปุ่มสลับภาษาเพื่อเปลี่ยนระหว่าง EN และ TH

หมายเหตุ

- แผนที่ถูกจำกัดให้อยู่ในพื้นที่มหาวิทยาลัยแม่ฟ้าหลวง
- ระบบไม่อนุญาตให้เลือกต้นทางและปลายทางเป็นสถานีเดียวกัน
- ถ้าเริ่มจากสถานีฝั่ง outbound บางจุด ระบบจะจำกัดปลายทางให้ไปตามทิศทางรถเท่านั้น เพื่อลดปัญหาเส้นทางย้อนศร
- สถานีฝั่ง outbound จะแสดงปลายทางตามลำดับถัดไปจนถึง Minnimart Lamduan เท่านั้น

### 2.2 Favorite Stations

หน้า Favorite Stations ใช้สำหรับบันทึกสถานีที่ใช้บ่อย

วิธีใช้งาน

1. เปิดเมนู Favorite Stations
2. กด `Add new`
3. เลือกสถานีที่ต้องการบันทึก
4. สถานีโปรดจะแสดงอยู่ด้านบนของรายการค้นหาในหน้า Home
5. กดไอคอนถังขยะเพื่อลบสถานีโปรด

### 2.3 Bus Stations

หน้า Bus Stations แสดงรายการสถานีรถรับส่ง

วิธีใช้งาน

1. เปิดเมนู Bus Stations
2. ดูรายชื่อสถานีและสายรถที่ผ่าน
3. กดไอคอนบ้านเพื่อกลับหน้า Home

### 2.4 Help & Feedback

หน้า Help & Feedback ใช้สำหรับส่งรายงานปัญหาและ feedback

ประเภทปัญหาที่ส่งได้

- Accident
- Breakdown
- Construction
- Road Closed
- Obstacle
- Complaint
- Feedback

วิธีส่งรายงานปัญหา

1. เปิดหน้า Help & Feedback
2. เลือกประเภทปัญหา
3. กรอก Location และ Describe the problem
4. กด `Send`

ระบบจะแสดงกรอบแดงในช่องที่ยังไม่ได้กรอก และไม่ให้ส่งถ้าข้อมูลจำเป็นไม่ครบ

วิธีส่ง Feedback

1. เลือก `Feedback`
2. ให้คะแนนดาว 1-5 ในแต่ละหัวข้อ
3. กด `Send`

ระบบจะไม่ให้ส่ง feedback ถ้ายังเลือกดาวไม่ครบทุกข้อ

### 2.5 Settings

หน้า Settings ใช้สำหรับเข้าถึงเมนูหลักของผู้ใช้ เช่น Bus Stations, Favorite Stations และ Help & Feedback

## 3. คู่มือผู้ดูแลระบบ Admin Web

### 3.1 เข้าสู่ระบบ Admin

1. เปิด Admin Web
2. เข้าสู่ระบบด้วยบัญชีผู้ดูแล
3. เมื่อเข้าสู่ระบบสำเร็จจะเข้าสู่ Dashboard

ถ้ารันด้วย Docker และใช้ข้อมูลตัวอย่าง จะมีบัญชีสำรอง

```text
username: admin
password: 12345678
```

### 3.2 Dashboard

Dashboard ใช้ดูภาพรวมระบบ

ข้อมูลหลัก

- จำนวนผู้โดยสารที่รออยู่
- จำนวนรถที่ online
- จำนวน report ที่ยังค้าง
- แผนที่สถานีแบบ live station map
- Crowd alerts
- Dispatch guide

### 3.3 Station Setting

หน้า Station Setting ใช้จัดการข้อมูลสถานี

การเพิ่มสถานี

1. กด `Add station`
2. กรอกข้อมูลสถานี
3. เลือกสายรถที่ผ่าน
4. กดบันทึก

การแก้ไขสถานี

1. กด `Edit` ที่แถวสถานี
2. แก้ข้อมูลที่ต้องการ
3. กดบันทึก

การลบสถานี

1. กด `Delete`
2. ยืนยันการลบ

### 3.4 Station CCTV

หน้า Station CCTV ใช้ดูหรือจัดการข้อมูลกล้องของสถานีที่เชื่อมต่อกับระบบ

### 3.5 Buses

หน้า Buses ใช้ดูสถานะรถและจัดการข้อมูลรถ

ข้อมูลที่แสดง

- รายการรถทั้งหมด
- สายรถ
- สถานะ online/offline
- จำนวนรถ online/offline/total

### 3.6 Reports

หน้า Reports ใช้ตรวจรายงานจากผู้ใช้และ feedback

แท็บหลัก

- Active reports: รายงานที่ต้องดำเนินการ
- Feedback หรือ ติชม: รายการ feedback จากผู้ใช้
- History report: รายงานที่ resolved แล้ว

ตัวกรองที่ใช้ได้

- Search
- Category เฉพาะ Active reports และ History report
- Date range
- Status

การเปลี่ยนสถานะ report

1. เปิดแท็บ Active reports
2. เลือกสถานะในช่อง Report Status
3. สถานะจะเปลี่ยนตามค่าที่เลือก เช่น Pending, In progress, Resolved

หมายเหตุ

- Feedback ใช้สำหรับดูคะแนนและความคิดเห็น ไม่ต้องจัดการสถานะ pending
- History report แสดงสถานะเป็น Resolved เท่านั้น
- Guest user จะแสดงเป็นลำดับ เช่น Guest user 01, Guest user 02 ตามลำดับเวลาที่ส่ง

## 4. คู่มือการติดตั้งสำหรับผู้ดูแลระบบ

ทำตาม [HANDOVER.md](HANDOVER.md) สำหรับเครื่องใหม่ รวม dependencies, env และบัญชีทดสอบ
Local ใช้ Backend พอร์ต 5101, Admin 5173 และ Passenger 5174 ตามคำสั่งที่ระบุในคู่มือ
หากใช้ Docker อ่าน [DOCKER.md](DOCKER.md) ซึ่งใช้หน้าเว็บพอร์ต 8180/8181

### ข้อมูลรถแบบ Realtime

เปิดหน้าเว็บตามปกติ ไม่ต้องกดเปิด Realtime หรือเปิด Console เพื่อให้รถอัปเดต
ระบบโหลดข้อมูลเริ่มต้นจาก API และรับข้อมูลรถใหม่ผ่าน Supabase เมื่อเชื่อมต่อได้
หากการเชื่อมต่อหลุด ระบบใช้ API สำรองและโหลดข้อมูลใหม่เมื่อกลับ online
รถจอดอาจมีตำแหน่งเดิม แม้ระบบกำลังรับข้อมูลอยู่; ETA ขึ้นกับความสด ทิศทาง และความเร็ว GPS

จำนวนคนรอที่สถานี รายงาน และ detector ยังใช้การโหลด API ตามเดิม
ตรวจเชิงเทคนิคที่ [REALTIME.md](REALTIME.md) และ [GPS.md](GPS.md)

## 5. การตรวจสอบก่อนใช้งานจริง

ควรทดสอบรายการต่อไปนี้ก่อนส่งมอบหรือ deploy

- Backend เปิดได้ที่ `http://localhost:5101`
- MongoDB เชื่อมต่อได้
- Admin Web เข้าสู่ระบบได้
- Dashboard โหลดข้อมูลได้
- หน้า Reports แสดงรายงานและเปลี่ยนสถานะได้
- เว็บผู้โดยสาร Vue เปิดแผนที่ได้
- เลือก From/To station แล้วเส้นทางขึ้นถูกต้อง
- เลือก From/To station แล้วไม่สามารถเลือกสถานีซ้ำหรือย้อนทิศทาง outbound ได้
- ส่ง report จากแอปแล้วเห็นใน Admin Web
- ส่ง feedback จากแอปแล้วเห็นใน Admin Web
- เปลี่ยนภาษา EN/TH ได้ทั้งแอปและ Admin Web

## 6. ข้อควรระวัง

- ห้าม commit API key จริงหรือไฟล์ `.env`
- ถ้าเปลี่ยน backend URL ต้องแก้ทั้ง Admin Web และ เว็บผู้โดยสาร Vue
- ถ้าใช้มือถือจริง ต้องใช้ IP เครื่อง backend แทน `localhost`
- Google Maps ต้องเปิด API และใส่ key ให้ถูกต้อง
- ข้อมูลตัวอย่างใน Docker ใช้สำหรับ demo ไม่ควรใช้เป็นข้อมูลจริงใน production
