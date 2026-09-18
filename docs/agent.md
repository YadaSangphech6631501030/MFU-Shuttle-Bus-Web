# System Architecture และแนวทางพัฒนาต่อ

อัปเดต 16 กันยายน 2026 สำหรับ MFU-Shuttle-Bus-Web

## Runtime

```text
GPS provider -> Node GPS worker -> MongoDB
                            -> snapshot cache -> Supabase Broadcast -> Vue ทั้งสองเว็บ
                                               -> snapshot GET -> initial/reconnect/fallback

Vue Passenger/Admin -> REST API -> MongoDB
Admin CCTV -> Node detector service -> Python YOLO -> จำนวนคน/ภาพใน runtime
```

Node เริ่มจาก `backend-node/app.js`: โหลด root `.env` ผ่าน `config.js`, เชื่อม MongoDB และเริ่ม worker
Seed และ diagnostic scripts โหลดค่าเดียวกันผ่าน `config.js`; Vite ทั้งสองเว็บอ่าน root `.env` ผ่าน `envDir` และเปิดเผยเฉพาะ `VITE_*`
การเรียก API/การล็อกอินใช้ Express และ JWT เดิม Supabase ไม่ใช่ฐานข้อมูลหลักหรือระบบล็อกอินของแอป
Docker มี `mongo`, `backend`, `admin-web`, `user-web`; ทั้งสองเว็บเป็น Vue/Vite

## ความรับผิดชอบ

| ส่วน | Source |
|---|---|
| GPS validation, MongoDB write, public projection | `backend-node/services/gps.js` |
| เชื่อม worker, snapshot, publisher | `backend-node/services/gps-runtime.js` |
| shared snapshot และ sequence | `backend-node/services/bus-snapshots.js` |
| private Broadcast | `backend-node/services/supabase.js` |
| initial/reconnect/fallback | `src/services/busFeed.ts` ทั้งสองเว็บ |
| UI และ lifecycle | `src/App.vue` ทั้งสองเว็บ |
| แผนที่/ETA/เส้นทางผู้โดยสาร | `frontend-vue/src/arrival.ts`, `liveGps.ts`, `gpsMotion.ts`, `routePlanning.ts` |
| MongoDB | ค่าเริ่มต้น `shuttlebus_web_system` |

รายละเอียด payload, ข้อจำกัด single backend instance และ recovery อยู่ใน [REALTIME.md](REALTIME.md)

## ขอบเขตสิทธิ์

- `backend-node/middleware/jwt.js` ตรวจ Node JWT และ `admin.js` ตรวจ role admin ตาม route ที่ใช้งาน
- Secret key ของ Supabase อยู่ Node เท่านั้น; เว็บใช้ Publishable key
- ช่องรถตรวจ RLS ผ่าน `private: true` และ `backend-node/sql/realtime.sql`
- `anon`/`authenticated` อ่านข้อมูลรถได้โดยไม่ต้องสร้าง Supabase user; browser ส่งข้อมูลรถไม่ได้
- ข้อมูลผู้ใช้ รายงานส่วนตัว และกล้องห้ามรวมในช่องรถสาธารณะสำหรับผู้โดยสาร
- `/api/report` บาง operations ในโค้ดเดิมยังไม่มี admin middleware การเพิ่ม Realtime ไม่ได้เปลี่ยนสิทธิ์ REST เดิม ต้องประเมินก่อนนำข้อมูลจริงมาใช้

## ลำดับอ่าน source

1. อ่าน [projectmap.md](projectmap.md) เพื่อหาไฟล์ที่ runtime ใช้จริง
2. อ่าน route และ API wrapper ที่เกี่ยวข้อง
3. ตรวจ schema/projection และไฟล์ tests ก่อนเปลี่ยน payload
4. ถ้าแก้ Realtime ให้แก้ตัวรับสองเว็บพร้อมกันและรักษา fallback/reconnect/ordering
5. ตรวจ `npm run build` ของเว็บที่แก้และ tests ตาม [REALTIME.md](REALTIME.md#คำสั่งตรวจสอบโค้ด)
6. อัปเดตคู่มือเมื่อเปลี่ยน env, API หรือขั้นตอนรัน

เอกสารที่อ้าง source เก่าต้องแก้ตามไฟล์ที่ import/mount จริง ไม่ใช่ตามชื่อโฟลเดอร์หรือข้อมูล demo เก่า
อย่าแก้ไฟล์ build, node_modules หรือ runtime frames เป็น source
