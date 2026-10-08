# mqtt-service

MQTT broker service — รองรับ subscribe แบบมีสิทธิ์ (JWT + access code) และ log ทุก
MQTT event ลงฐานข้อมูล โดย **ไม่ต้องติดตั้ง broker แยกต่างหาก** (ใช้ [aedes](https://github.com/moscajs/aedes)
ซึ่งเป็น MQTT broker แบบ pure-JS ที่ embed เข้ากับ process ของ service นี้เอง)

> ดูเอกสารออกแบบละเอียดได้ที่ [design/mqtt-broker-design.md](./design/mqtt-broker-design.md)

## เทคโนโลยีที่ใช้

| ส่วนประกอบ | เทคโนโลยี |
|---|---|
| Runtime | Node.js (TypeScript, CommonJS) |
| HTTP API | `node:http` (ไม่ใช้ web framework) |
| MQTT Broker | [aedes](https://github.com/moscajs/aedes) |
| JWT | `jsonwebtoken` (verify อย่างเดียว ออก token โดยระบบ auth ภายนอก) |
| ฐานข้อมูล | MySQL ผ่าน `knex` + `mysql2` |
| Dev/Build | `tsc`, `tsx` |

## โครงสร้างโปรเจกต์

```
src/
├── index.ts                  # จุดเริ่มต้นโปรแกรม + graceful shutdown
├── config/env.ts             # โหลด/ตรวจสอบ environment variables
├── db/
│   ├── knex.ts                # knex instance
│   ├── migrations/            # migration ของ mqtt_subscribe, mqtt_event
│   └── repositories/          # query ต่อตาราง access_code, mqtt_subscribe, mqtt_event
├── services/                 # business logic: ตรวจสอบ code, ออก subscribe_id/token
├── http/                     # HTTP API: POST /subscribe-requests, GET /health
├── mqtt/                     # bootstrap aedes broker (TCP/TLS/WS) + auth hooks + event buffer
├── jobs/                     # background jobs: batch event writer, partition rotation, expire sweep
├── types/                    # shared types + aedes module augmentation
└── utils/                    # logger, crypto, jwt, rate limiter
```

## ข้อกำหนดเบื้องต้น (Prerequisites)

- Node.js 20 ขึ้นไป (ทดสอบบน Node 24)
- MySQL server ที่มีตาราง `admin.access_code` อยู่แล้ว (ตารางเดิม ไม่ได้สร้างโดย service นี้)

## การติดตั้ง

```bash
npm install
```

## การตั้งค่า Environment Variables

คัดลอกไฟล์ตัวอย่างแล้วแก้ไขค่าตามสภาพแวดล้อมของคุณ:

```bash
cp .env.example .env
```

| ตัวแปร | คำอธิบาย | ค่าเริ่มต้น |
|---|---|---|
| `PORT` / `HOST` | พอร์ต/โฮสต์ของ HTTP API | `3001` / `0.0.0.0` |
| `CORS_ORIGIN` | origin ที่อนุญาตให้เรียก HTTP API ข้าม origin (เช่นเว็บ Angular) | `*` |
| `SECRET_KEY` | secret สำหรับ verify JWT (ออก token โดยระบบ auth ภายนอก) | - |
| `JWT_ALGORITHM` | algorithm ที่อนุญาตตอน verify JWT | `HS256` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | การเชื่อมต่อ MySQL | - |
| `DB_POOL_MIN` / `DB_POOL_MAX` | ขนาด connection pool ของ knex | `2` / `10` |
| `MQTT_HOST` | โฮสต์ที่ broker bind ฟัง | `0.0.0.0` |
| `MQTT_TCP_PORT` | พอร์ต MQTT ผ่าน TCP ธรรมดา | `1883` |
| `MQTT_TLS_ENABLED` / `MQTT_TLS_PORT` / `MQTT_TLS_KEY_PATH` / `MQTT_TLS_CERT_PATH` | เปิด/ตั้งค่า MQTT ผ่าน TLS | `false` / `8883` |
| `MQTT_WS_PORT` / `MQTT_WS_PATH` | พอร์ต/พาธ MQTT ผ่าน WebSocket (สำหรับ browser เช่น Angular) | `8083` / `/mqtt` |
| `MQTT_PUBLIC_HOST` | host ที่ตอบกลับไปให้ client เอาไปต่อ MQTT จริง (อาจต่างจาก `MQTT_HOST` ที่ใช้ bind) | `localhost` |
| `MQTT_EVENT_RETENTION_DAYS` | จำนวนวันที่เก็บข้อมูลใน `mqtt_event` ก่อน partition เก่าจะถูก drop | `90` |
| `MQTT_EVENT_PARTITION_BUFFER_DAYS` | buffer เพิ่มก่อน drop partition กันกรณี job รันไม่ทัน | `10` |
| `MQTT_EVENT_PARTITION_LOOKAHEAD_DAYS` | จำนวนวันที่สร้าง partition ล่วงหน้า | `3` |
| `MQTT_EVENT_PARTITION_MAINTENANCE_HOUR` | ชั่วโมงที่รัน partition rotation job ทุกวัน (0-23) | `2` |
| `MQTT_EVENT_FLUSH_INTERVAL_MS` / `MQTT_EVENT_FLUSH_MAX_BATCH` | ความถี่/ขนาด batch ที่ flush `mqtt_event` ลง DB | `200` / `1000` |
| `MQTT_EVENT_BUFFER_MAX_SIZE` | ขนาด buffer สูงสุดก่อนเริ่มทิ้งแถวเก่าสุด (backpressure) | `50000` |
| `SUBSCRIBE_EXPIRE_SWEEP_INTERVAL_MS` | ความถี่ job mark `mqtt_subscribe` ที่หมดอายุเป็น inactive | `60000` |
| `SUBSCRIBE_RATE_LIMIT_WINDOW_MS` / `SUBSCRIBE_RATE_LIMIT_MAX` | rate limit ของ `POST /subscribe-requests` ต่อ IP | `60000` / `20` |

## การรัน Database Migrations

สร้างตาราง `admin.mqtt_subscribe` และ `admin.mqtt_event` (ตาราง `admin.access_code` เป็นตารางเดิม
ไม่ได้จัดการโดย migration เหล่านี้):

```bash
npm run migrate:latest
```

คำสั่งอื่นที่เกี่ยวข้อง:

```bash
npm run migrate:rollback   # ย้อนกลับ migration ล่าสุด
npm run migrate:make -- create_my_table   # สร้างไฟล์ migration ใหม่
```

## การใช้งาน

### โหมดพัฒนา (Development)

รันด้วย `tsx` แบบ watch mode (คอมไพล์และรีสตาร์ทอัตโนมัติเมื่อมีการแก้ไขไฟล์):

```bash
npm run dev
```

### สร้างไฟล์สำหรับ Production (Build)

```bash
npm run build
```

### รันใน Production

```bash
npm start
```

เมื่อ service เริ่มทำงาน จะเปิดพร้อมกัน 4 listener: HTTP API (`PORT`), MQTT TCP (`MQTT_TCP_PORT`),
MQTT TLS ถ้าเปิดใช้งาน (`MQTT_TLS_PORT`) และ MQTT WebSocket (`MQTT_WS_PORT`)

## ภาพรวม Flow การขอ subscribe

1. Client ขอ JWT จากระบบ auth ภายนอก (service นี้ไม่ได้ออก token เอง)
2. Client เรียก `POST /subscribe-requests` พร้อม JWT (header) และ `code` (จาก `admin.access_code`)
3. Service ตรวจสอบ JWT + ตรวจสอบ `code` (uid, hospcode, date, expire, isactive) แล้วออก
   `subscribeId`/`subscribeToken` คู่ใหม่ บันทึกลง `admin.mqtt_subscribe` (รองรับ multi-session:
   โค้ดเดียวกันขอซ้ำจากหลายอุปกรณ์ได้ ได้ `subscribeId` คนละตัว ใช้งานพร้อมกันได้)
4. Client นำ `subscribeId`/`subscribeToken` ไปต่อ MQTT จริง (TCP/TLS/WS) โดยใช้เป็น
   username/password แล้ว subscribe/publish ได้เฉพาะภายใน topic ที่ได้รับสิทธิ์
   (`hospcode/{hospcode}/uid/{uid}/#`)
5. ทุก connect/publish/disconnect จะถูกบันทึกลง `admin.mqtt_event`

## API

### `POST /subscribe-requests`

Header: `Authorization: Bearer <jwt>`

Body:

```json
{ "code": "ABC123", "clientLabel": "web-dashboard" }
```

`clientLabel` ไม่บังคับ ใช้ระบุอุปกรณ์/session (เช่นสำหรับแสดงในหน้า manage session)

Response `201 Created`:

```json
{
  "subscribeId": "e66cf6ba-fa67-4a8a-898f-4b5831c9d87f",
  "subscribeToken": "c3ce89fb1972eebf6d36a178e86835782a6f8931ba57832467b2055cbe0f96c",
  "topic": "hospcode/10670/uid/user001/#",
  "expireAt": "2026-11-06T23:47:13.000Z",
  "mqtt": {
    "host": "localhost",
    "tcpPort": 1883,
    "tlsPort": null,
    "wsPort": 8083,
    "wsPath": "/mqtt"
  }
}
```

> `subscribeToken` ส่งกลับเป็น plaintext **ครั้งเดียว** ตอนนี้เท่านั้น ฝั่ง DB เก็บแต่ hash

Error responses:

| HTTP status | `error` | สาเหตุ |
|---|---|---|
| 401 | `missing_bearer_token` | ไม่มี header `Authorization: Bearer ...` |
| 401 | `invalid_token` | JWT ไม่ผ่านการ verify (signature/exp ผิด) |
| 400 | `code_required` | ไม่ได้ส่ง `code` หรือรูปแบบไม่ถูกต้อง |
| 403 | `not_found` / `inactive` / `not_started` / `expired` | `code` ไม่ผ่านเงื่อนไขใน `access_code` |
| 429 | `too_many_requests` | เกิน rate limit ต่อ IP |

### `GET /health`

```json
{ "status": "ok" }
```

## หัวข้อ MQTT (Topic) และสิทธิ์

Topic ที่แต่ละ `subscribeId` ได้รับสิทธิ์คือ `hospcode/{hospcode}/uid/{uid}/#` (มาจาก `access_code`
ของ `code` ที่ใช้ขอ) ข้อควรรู้เรื่องพฤติกรรมของ broker เมื่อ subscribe/publish นอกเหนือสิทธิ์:

- **subscribe นอก topic ที่ได้รับสิทธิ์**: broker ปฏิเสธเฉพาะ topic นั้น (SUBACK return code `128`)
  โดย **connection ไม่หลุด** ยังใช้งาน topic อื่นที่ได้รับสิทธิ์ต่อได้ปกติ
- **publish นอก topic ที่ได้รับสิทธิ์**: broker จะ**ปิด connection ทั้งเส้นทันที** (ไม่มีการแจ้งเตือน
  กลับไปที่ client เพราะ MQTT 3.1.1 ไม่มี reason code ระดับ publish — เป็นพฤติกรรมมาตรฐานของ aedes/MQTT
  spec ไม่ใช่ bug) ฝั่ง client ควร publish เฉพาะ topic ที่ topic ตรงกับ `topic` ที่ได้รับมาจาก
  `POST /subscribe-requests` เท่านั้น

## วิธีเชื่อมต่อจาก Node.js

ติดตั้งไลบรารี [`mqtt`](https://www.npmjs.com/package/mqtt) ฝั่ง client:

```bash
npm install mqtt
```

```ts
import mqtt from 'mqtt'

const res = await fetch('http://localhost:3001/subscribe-requests', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ code: 'ABC123' }),
})
const { subscribeId, subscribeToken, topic, mqtt: mqttInfo } = await res.json()

const client = mqtt.connect(`mqtt://${mqttInfo.host}:${mqttInfo.tcpPort}`, {
  username: subscribeId,
  password: subscribeToken,
})

client.on('connect', () => {
  client.subscribe(topic, { qos: 0 })
})

client.on('message', (receivedTopic, payload) => {
  console.log(receivedTopic, payload.toString())
})
```

## วิธีเชื่อมต่อจาก Angular (Dev)

เบราว์เซอร์เชื่อมต่อ TCP ตรง ๆ ไม่ได้ จึงต้องใช้ช่องทาง **WebSocket** (`MQTT_WS_PORT`, ค่าเริ่มต้น
`8083`, path `/mqtt`) ส่วน HTTP API เรียกผ่าน `HttpClient`/`fetch` ปกติ

### 1. เตรียม service ให้รองรับ CORS (เฉพาะตอน dev)

ตอน dev ที่ Angular รันด้วย `ng serve` (ปกติ `http://localhost:4200`) จะเป็นคนละ origin กับ API นี้
(`http://localhost:3001`) service นี้เปิด CORS ให้แล้วผ่านตัวแปร `CORS_ORIGIN` ใน `.env`
(ค่าเริ่มต้น `*` ใช้ได้เลยตอน dev โดยไม่ต้องตั้งค่า Angular proxy เพิ่ม) สำหรับ production ควรระบุ
origin จริงของเว็บแทน เช่น `CORS_ORIGIN=https://myapp.co.th`

### 2. ติดตั้งไลบรารี `mqtt` ในโปรเจกต์ Angular

```bash
npm install mqtt
```

### 3. สร้าง Angular service (`mqtt.service.ts`)

```ts
import { Injectable, OnDestroy } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import mqtt, { MqttClient } from 'mqtt'
import { firstValueFrom, Subject } from 'rxjs'

interface SubscribeRequestResponse {
  subscribeId: string
  subscribeToken: string
  topic: string
  expireAt: string
  mqtt: { host: string; wsPort: number; wsPath: string }
}

export interface MqttMessage {
  topic: string
  payload: unknown
}

@Injectable({ providedIn: 'root' })
export class MqttService implements OnDestroy {
  private client: MqttClient | null = null
  private topic = ''

  readonly messages$ = new Subject<MqttMessage>()

  constructor(private http: HttpClient) {}

  // jwt = JWT ที่ได้จากระบบ auth ของแอป, code = access code ที่ผู้ใช้กรอก/ได้รับมา
  async connect(jwt: string, code: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<SubscribeRequestResponse>(
        'http://localhost:3001/subscribe-requests',
        { code, clientLabel: 'angular-web' },
        { headers: { authorization: `Bearer ${jwt}` } },
      ),
    )

    this.topic = res.topic
    const wsUrl = `ws://${res.mqtt.host}:${res.mqtt.wsPort}${res.mqtt.wsPath}`

    this.client = mqtt.connect(wsUrl, {
      username: res.subscribeId,
      password: res.subscribeToken,
      clientId: `web-${Math.random().toString(16).slice(2)}`,
    })

    this.client.on('connect', () => {
      this.client?.subscribe(this.topic, { qos: 0 })
    })

    this.client.on('message', (topic, payload) => {
      this.messages$.next({ topic, payload: JSON.parse(payload.toString()) })
    })

    this.client.on('error', (err) => console.error('mqtt error:', err.message))
  }

  // publish ได้เฉพาะ topic ย่อยของ this.topic เท่านั้น (เช่น `${baseTopic}/chat`)
  // ตาม topic ที่ตัดท้าย /# ออก — publish นอกขอบเขตนี้จะโดน broker ปิด connection ทันที
  publish(subTopic: string, body: unknown): void {
    const baseTopic = this.topic.replace(/\/#$/, '')
    this.client?.publish(`${baseTopic}/${subTopic}`, JSON.stringify(body), { qos: 0 })
  }

  ngOnDestroy(): void {
    this.client?.end()
  }
}
```

### 4. ใช้งานใน component

```ts
constructor(private mqttService: MqttService) {}

async ngOnInit() {
  await this.mqttService.connect(this.authJwt, this.accessCode)
  this.mqttService.messages$.subscribe((msg) => console.log('message:', msg))
}

sendChat(text: string) {
  this.mqttService.publish('chat', { text, timestamp: new Date().toISOString() })
}
```

### หมายเหตุสำหรับ production

- เปลี่ยนไปใช้ `wss://` (เปิด `MQTT_TLS_ENABLED=true` พร้อม `MQTT_TLS_KEY_PATH`/`MQTT_TLS_CERT_PATH`
  — หมายเหตุ: listener WS ปัจจุบันเป็น `ws://` plain เท่านั้น ถ้าต้องการ `wss://` ให้วาง service ไว้
  หลัง reverse proxy เช่น nginx ที่ทำ TLS termination แล้ว proxy ต่อไปที่ `MQTT_WS_PORT`)
- ตั้ง `CORS_ORIGIN` เป็น origin จริงของเว็บแอป ไม่ควรปล่อยเป็น `*` ใน production
- เก็บ `subscribeToken` ที่ฝั่ง client อย่างระมัดระวัง (เทียบเท่า password) และเรียก
  `POST /subscribe-requests` ใหม่เมื่อ `expireAt` ใกล้หมดอายุ

## ความปลอดภัยที่ implement ไว้แล้ว

- JWT verify ด้วย algorithm allowlist (กัน `alg: none` / HS-RS confusion)
- `subscribeToken` เก็บเป็น sha256 hash ใน DB เท่านั้น เทียบแบบ constant-time
  (`crypto.timingSafeEqual`)
- Topic ถูกจำกัดขอบเขตตาม `hospcode`/`uid` ทั้งฝั่ง subscribe และ publish
- Rate limit บน `POST /subscribe-requests` ต่อ IP
- `admin.mqtt_subscribe` มี `is_active`/`expire_at` ให้ revoke สิทธิ์ได้ทันทีโดยไม่ต้อง restart broker
