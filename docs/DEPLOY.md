# คู่มือ Deploy MFU Shuttle Bus ขึ้นเซิร์ฟเวอร์จริง

อัปเดต 23 กันยายน 2026 — แนวทางสำหรับทีมที่ยังไม่มีเซิร์ฟเวอร์ ใช้ Linux + Docker Compose บนเครื่องเดียว และแยกโดเมน User Web, Admin Web และ API
คู่มือนี้และไฟล์ตัวอย่างยังไม่ได้ผ่านการ Deploy บนเซิร์ฟเวอร์จริงของทีม ไม่ใช่การรับรองความพร้อม production

## 1. เตรียมก่อนเลือกเซิร์ฟเวอร์

ขอข้อมูลจากมหาวิทยาลัยก่อนว่ามี Linux VM, โดเมนย่อย และการเข้าถึงกล้องผ่านเครือข่ายมหาวิทยาลัยให้หรือไม่ ถ้าไม่มี จึงเลือก VPS/Cloud VM ที่ติดตั้ง Docker ได้

สิ่งที่ต้องมี:

- Linux server เช่น Ubuntu 24.04 LTS พร้อม SSH และสิทธิ์ติดตั้ง Docker
- พื้นที่เก็บ MongoDB และไฟล์ detector แบบถาวร รวมทั้งพื้นที่ backup นอกเครื่อง
- โดเมนสามชื่อที่แก้ DNS ได้ เช่น `shuttle.example.com`, `admin-shuttle.example.com`, `api-shuttle.example.com`
- การเข้าถึง GPS provider, Supabase และแหล่งภาพกล้องจาก server
- ผู้รับผิดชอบค่าเครื่อง/โดเมน บัญชี Cloud และการกู้คืนข้อมูล

ขนาดเครื่องต้องเลือกตามจำนวนกล้องและความถี่ตรวจจับด้วย YOLO ไม่ควรคำนวณจากจำนวนผู้ใช้เว็บอย่างเดียว ทดลอง detector กับภาพจริงและวัด CPU/RAM ก่อนกำหนดขนาดเครื่อง ไม่มีผล load test ที่ยืนยันจำนวนผู้ใช้พร้อมกันในคู่มือนี้
หากกล้องอยู่ในวง LAN มหาวิทยาลัย VPS จะเข้าถึงไม่ได้โดยอัตโนมัติ ต้องให้ผู้ดูแลเครือข่ายจัดเส้นทางหรือ VPN

## 2. สิ่งที่ต้องแก้ก่อนเปิดสาธารณะ

จากโค้ด ณ วันที่เขียนคู่มือ ยังต้องแก้และทดสอบ:

- `backend-node/routes/auth.js`: `/auth/register-admin` ยังสร้าง Admin โดยไม่ตรวจสิทธิ์ ต้องปิดหรือจำกัดให้ Admin เดิมเท่านั้น
- `backend-node/routes/report.routes.js`: GET/PUT/DELETE รายงานยังไม่มี Admin authentication; POST สำหรับผู้ใช้ทั่วไปแยกไว้ได้
- `admin-web/src/page/Settings.vue`: การลบแถวหลักยังไม่สอดคล้องกับ payload สามช่วงหลัก ต้องแก้ก่อนให้ผู้ดูแลใช้จริง
- Build Docker ที่รวม detector ให้สำเร็จ และทดสอบกล้องจริง; build แบบไม่รวม detector ไม่ยืนยันส่วน YOLO

เตรียม server และทดสอบในเครือข่ายจำกัดได้ แต่ยังไม่เปิด HTTP/HTTPS ให้สาธารณะจนตรวจรายการนี้ผ่าน ตัวอย่าง gateway ด้านล่างไม่ได้แก้ปัญหาสิทธิ์ของ API ให้

## 3. ติดตั้งและนำโค้ดขึ้นเครื่อง

ติดตั้ง Docker Engine และ Compose plugin ตาม [เอกสาร Docker สำหรับ Ubuntu](https://docs.docker.com/engine/install/ubuntu/) เลือกวิธี apt repository
ไฟล์ overlay ใช้ `!override` จึงต้องมี Compose 2.24.4 ขึ้นไป ตาม [กติกาการรวม Compose](https://docs.docker.com/reference/compose-file/merge/)

คำสั่งต่อไปนี้ใช้บน server ด้วยบัญชีที่รัน Docker ได้ หากบัญชียังไม่มีสิทธิ์ให้ใช้ sudo ตามการตั้งค่าของผู้ดูแล

```bash
docker version
docker compose version
git clone <URL_REPOSITORY_ของทีม> MFU-Shuttle-Bus-Web
cd MFU-Shuttle-Bus-Web
cp .env.example .env
chmod 600 .env
```

แทนค่า `<URL_REPOSITORY_ของทีม>` ก่อนรัน สำหรับ repo ส่วนตัวให้ใช้ SSH key หรือระบบ credential ที่ทีมกำหนด ไม่ใส่ token ลงใน URL
เครื่อง server จะได้เฉพาะโค้ดที่ push แล้ว: commit ในเครื่องอย่างเดียวยังไม่ทำให้ server ดึงโค้ดใหม่ได้

## 4. ตั้งค่า .env และโดเมน

แก้ root `.env` บน server โดยไม่ส่งไฟล์นี้ขึ้น Git ตัวอย่างค่าที่ต้องปรับ (โดเมนนี้เป็นตัวอย่าง ต้องเปลี่ยนทุกตำแหน่ง):

```dotenv
DB_NAME=shuttlebus_web_system
SECRET_KEY=REPLACE_WITH_A_LONG_RANDOM_SECRET
INSTALL_DETECTOR=true
USER_DOMAIN=shuttle.example.com
ADMIN_DOMAIN=admin-shuttle.example.com
API_DOMAIN=api-shuttle.example.com
VITE_API_BASE_URL=https://api-shuttle.example.com
USER_WEB_API_BASE_URL=https://api-shuttle.example.com
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=REPLACE_WITH_BACKEND_SECRET
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=REPLACE_WITH_PUBLISHABLE_KEY
VITE_GOOGLE_MAPS_API_KEY=REPLACE_WITH_MAPS_KEY
ADMIN_USERNAME=YOUR_ADMIN_USERNAME
ADMIN_EMAIL=YOUR_ADMIN_EMAIL
ADMIN_PASSWORD=REPLACE_WITH_STRONG_ADMIN_PASSWORD
```

ใช้ `openssl rand -hex 32` สร้างค่า SECRET_KEY แล้วใส่ในไฟล์ กรอก `GPS_*` ตาม [GPS.md](GPS.md) และตั้ง Supabase policy ตาม [REALTIME.md](REALTIME.md)
ถ้าไม่ใช้ detector บนเครื่องนี้เลือก `INSTALL_DETECTOR=false` ได้ แต่ต้องมีแหล่งอัปเดตจำนวนคนอื่น มิฉะนั้นจำนวนคนจะไม่อัปเดตจากภาพกล้อง

`USER_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN` ใส่เฉพาะ hostname ไม่ใส่ `https://` ส่วน API URL ของ Vite ต้องใส่ `https://` และต้องเปิดได้จากเบราว์เซอร์ผู้ใช้ ห้ามใช้ `localhost` หรือชื่อ container เป็น URL ฝั่งเว็บ

ตั้ง DNS A ของทั้งสามชื่อให้ชี้ public IPv4 ของ server ถ้ามี AAAA ต้องชี้ IPv6 ที่ใช้งานได้ด้วย หลังผ่านข้อ 2 จึงเปิด inbound TCP 80/443 และจำกัด SSH ให้ผู้ดูแล Caddy ใช้ DNS และพอร์ตเหล่านี้ในการออก/ต่ออายุใบรับรอง ตาม [Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
หากมหาวิทยาลัยมี reverse proxy หรือระบบใบรับรองอยู่แล้ว ให้ผู้ดูแลปรับ gateway ให้เข้ากับระบบเดิมก่อนใช้งาน

Google Maps: เปิด Maps JavaScript API และตั้ง Billing ของโปรเจกต์ จำกัด Website referrers ให้โดเมน User/Admin เช่น `https://shuttle.example.com/*` และ `https://admin-shuttle.example.com/*` ตาม [คู่มือ API key ของ Google](https://developers.google.com/maps/documentation/javascript/get-api-key)

## 5. ใช้ Compose สำหรับเซิร์ฟเวอร์

ไฟล์ `docker-compose.deploy.yml` ใช้ร่วมกับไฟล์เดิม โดย:

- เปิดพอร์ต host เฉพาะ 80/443 ผ่าน Caddy; MongoDB, API และเว็บเข้าถึงกันใน Docker network
- ไม่นำเข้า demo data/admin บน volume ใหม่ แต่ยังใช้ `mongo-data` เก็บข้อมูลถาวร
- เก็บใบรับรอง Caddy ใน named volumes เพื่อไม่ขอใหม่ทุกครั้งที่ restart

อย่าใช้ `docker compose up` แบบไม่ระบุ overlay บน server เพราะไฟล์ local เดิมเปิดพอร์ต 27017/5101/8180/8181 ออก host และนำเข้า demo บน volume ใหม่
อย่าพึ่ง UFW อย่างเดียวกับพอร์ตที่ Docker publish เพราะ Docker อาจส่ง traffic ข้ามกฎ UFW ตาม [เอกสาร Docker firewall](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
MongoDB ตัวอย่างนี้ยังไม่มี authentication จึงใช้ได้เฉพาะ Docker network ที่ทีมควบคุม ห้ามเปิดพอร์ต MongoDB ให้ภายนอกหรือเชื่อม container ที่ไม่เชื่อถือเข้ามา

ตั้งฟังก์ชันนี้ใน shell ทุกครั้งที่เริ่ม SSH session จาก root repo เพื่อใช้คำสั่งสั้นลง:

```bash
dc() { docker compose -f docker-compose.yml -f docker-compose.deploy.yml "$@"; }
dc config --quiet
dc build backend admin-web user-web
dc up -d mongo
```

ใช้ directory และ Compose project name เดิมทุกครั้ง เพื่อให้ใช้ named volumes ชุดเดิม หากเคยรันแบบ local Docker บน server นี้แล้ว การเพิ่ม overlay ไม่ลบ demo หรือบัญชีเดิม ต้องตรวจฐานข้อมูลก่อนใช้จริง

## 6. ย้ายฐานข้อมูลเดิม หรือเริ่มระบบใหม่

**มีข้อมูลเดิม:** หยุดการเขียนข้อมูลจาก Backend/detector ต้นทางชั่วคราวก่อน export เพื่อให้ข้อมูลสอดคล้องกัน ใช้ MongoDB Database Tools บนเครื่องต้นทาง โดยแก้ชื่อ DB ให้ตรงจริง:

```bash
mongodump --uri="mongodb://localhost:27017/" --db=shuttlebus_web_system --archive=shuttle.archive.gz --gzip
scp shuttle.archive.gz deploy@YOUR_SERVER:/srv/backups/shuttle.archive.gz
```

ให้ผู้ดูแลสร้าง `/srv/backups` พร้อมสิทธิ์จำกัดก่อนส่งไฟล์ และเก็บ archive นอก repo ตรวจ MongoDB major version/compatibility ของต้นทางกับปลายทางก่อนย้าย ตาม [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/)

บน server ทำขั้นตอนนี้เฉพาะฐานปลายทางใหม่ที่ว่าง และยังไม่เปิด Backend:

```bash
dc exec -T mongo mongorestore --archive --gzip --nsInclude='shuttlebus_web_system.*' < /srv/backups/shuttle.archive.gz
```

ใช้ชื่อ DB เดียวกับ `.env`; คำสั่งนี้ไม่ได้เปลี่ยน namespace ให้เอง และไม่ใช่คำสั่ง merge ฐานเดิมอย่างปลอดภัย หากมีข้อมูลปลายทางอยู่แล้วให้หยุดและวางแผนย้ายแยก ไม่เติม `--drop` เพื่อทดลอง ดู [mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/)
archive ควรรวม `users`, `stations`, `buses`, `reports`, `routes`, `settings` ตามข้อมูลที่มีจริง ตรวจบัญชี demo/บัญชีที่ไม่ใช้ก่อนเปิดระบบ

**เริ่มฐานใหม่:** ไม่ต้อง restore ให้สร้าง Admin ด้วยค่าที่ตั้งไว้ใน `.env`:

```bash
dc run --rm --no-deps backend node seed/seed_admin.js
```

ใช้ seed นี้เฉพาะเมื่อตั้ง `ADMIN_USERNAME/EMAIL/PASSWORD` จริงครบแล้ว สคริปต์มีค่า demo fallback และจะเปลี่ยนข้อมูลบัญชีชื่อเดิมหากมีอยู่แล้ว
เริ่มใหม่จะไม่มีสถานีและกล้อง ต้องเพิ่มผ่าน Admin Web; Backend สร้าง routes ค่าเริ่มต้นที่ยังไม่มีให้อัตโนมัติ

## 7. เปิดระบบและตรวจรับ

หลังข้อมูลพร้อมและข้อ 2 แก้ครบแล้ว:

```bash
dc up -d
dc ps
dc logs --tail=80 backend gateway
dc exec -T backend node -e "fetch('http://127.0.0.1:5101/health').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
```

ตรวจจากเครื่องอื่นโดยใช้โดเมนจริง:

```bash
curl -f https://api-shuttle.example.com/health
curl -f https://api-shuttle.example.com/api/buses/snapshot
curl -f https://api-shuttle.example.com/api/public-data
```

- User Web และ Admin Web เปิด HTTPS ได้ ไม่มี mixed content และ Google Maps โหลดได้
- Admin login/Settings บันทึกได้ และผู้ไม่ล็อกอินอ่าน/แก้/ลบรายงานหรือสร้าง Admin ไม่ได้
- ตำแหน่งรถมี timestamp ใหม่ ตรวจ ETA กับรถจริง ไม่ถือว่าเห็นหมุดแล้ว GPS ใช้งานถูกต้อง
- Realtime รับ event ของ Supabase จริง ไม่ใช่แค่ WebSocket ของ Vite; ทดสอบตัดต่อเน็ตแล้วข้อมูลกลับมา
- เปลี่ยนจำนวนคน/สี/ชื่อสถานะแล้ว User Web อัปเดต และ Settings ยังอยู่หลัง restart
- Detector เข้าถึงกล้องได้ และจำนวนคนเปลี่ยนตามข้อมูลจริง
- ตรวจจากภายนอกว่าพอร์ต 27017/5101/8180/8181 ไม่เปิด
- ทดสอบจำนวนผู้ใช้ตามเป้าหมายและตรวจ CPU/RAM, latency, ข้อผิดพลาด และ Supabase usage

`/health` ตรวจเพียงว่า process ตอบได้ ไม่รับรองว่า GPS/Realtime/กล้องปกติทั้งหมด และการ refresh เว็บไม่แทนการทดสอบโหลดผู้ใช้พร้อมกัน

## 8. สำรอง อัปเดต และย้อนรุ่น

สำรอง MongoDB ทั้ง DB ไปนอก repo และคัดลอกไปพื้นที่นอก server ด้วย สำหรับตัวอย่าง standalone นี้ควรหยุด writers ทั้งหมดระหว่าง dump รวม detector ภายนอกถ้ามี:

```bash
umask 077
dc stop gateway backend
dc exec -T mongo sh -c 'mongodump --db="$MONGO_INITDB_DATABASE" --archive --gzip' > /srv/backups/shuttle-before-update.archive.gz
dc up -d backend gateway
```

ตรวจ exit code ของ dump และขนาดไฟล์ก่อนถือว่าสำเร็จ ตั้งชื่อไฟล์แต่ละครั้งไม่ให้เขียนทับ backup เดิม และซ้อม restore ในฐานทดสอบแยกก่อนพึ่งพา backup
สำรอง root `.env` และไฟล์ตั้งค่าที่แก้เฉพาะ server ด้วยช่องทางจำกัดสิทธิ์ ห้าม commit secrets

อัปเดตหลังตรวจ backup แล้ว:

```bash
git status --short
git rev-parse HEAD
git pull --ff-only
dc build backend admin-web user-web
dc up -d
dc ps
```

จด commit ก่อนอัปเดตและเก็บ image รุ่นก่อนด้วย tag แยกหากต้องการย้อนรุ่นได้เร็ว Vite env ถูกฝังตอน build เปลี่ยน API URL/Maps/Supabase ฝั่งเว็บต้อง rebuild เสมอ; `restart` อย่างเดียวไม่พอ
ถ้า build ล้มเหลว อย่าเรียก `up` ต่อ ตรวจ log และแก้ก่อน คำสั่งในคู่มือนี้ต้องรันทีละขั้นและตรวจผล

ถ้าต้องย้อนรุ่น ให้เลือก commit/tag ที่ผ่านการทดสอบและ build/recreate ด้วย overlay เดิม โดยตรวจว่าโค้ดเก่ารองรับ schema ปัจจุบันก่อน การย้อนโค้ดไม่ย้อนฐานข้อมูล และไม่ควร restore ทับข้อมูลใหม่โดยไม่มีแผนกู้คืน
ไม่ใช้ `down -v` ในการอัปเดต เพราะลบ named volumes รวมฐานข้อมูลและใบรับรอง

## สถานะการตรวจไฟล์ตัวอย่าง

ตรวจการรวม Compose ผ่านแล้ว: service ภายในไม่มี published ports, MongoDB ไม่ mount demo init และ gateway เปิดเฉพาะ 80/443 พร้อมตรวจลิงก์เอกสารแล้ว
ยังไม่ได้รัน Caddy validation ใน container เนื่องจาก Docker daemon บนเครื่องที่ตรวจไม่ทำงาน และยังไม่ได้ทดสอบ DNS/HTTPS บน server จริง ผู้รับงานควรตรวจต่อก่อนเปิดระบบ:

```bash
dc run --rm --no-deps gateway caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

การ validate config ไม่ยืนยันว่า DNS และการออกใบรับรองสำเร็จ ต้องทดสอบข้อ 7 ด้วย

## 9. ปัญหาที่พบบ่อย

| อาการ | ตรวจอะไร |
|---|---|
| เว็บเรียก localhost | แก้ Vite API URL เป็น HTTPS domain แล้ว rebuild ทั้งสองเว็บ |
| HTTPS ออกใบรับรองไม่ได้ | DNS A/AAAA, พอร์ต 80/443, proxy ของมหาวิทยาลัย และ gateway logs |
| 502 | Backend/web health และ service name ใน Caddyfile |
| แผนที่ไม่ขึ้น | Maps key, referrer ของโดเมนจริง, Billing และ quota |
| จำนวนคนไม่เปลี่ยน | Detector/กล้อง, MongoDB ที่ใช้จริง, public.updated และ fallback |
| GPS หยุด | Credentials, timestamp ของ provider และ outbound network จาก server |
| ข้อมูลเหมือนหาย | DB_NAME, Compose project/directory และ named volume ที่ต่ออยู่ อย่า seed ทับทันที |
| Detector build ค้าง | เครือข่ายดาวน์โหลด Python packages, พื้นที่ดิสก์ และ RAM; ไม่ถือว่า build เว็บผ่านแล้ว detector ผ่าน |

คู่มือที่เกี่ยวข้อง: [Docker local](DOCKER.md), [ส่งต่องาน](HANDOVER.md), [Realtime](REALTIME.md), [GPS](GPS.md), [ใช้งานระบบ](HANDBOOK.md)
