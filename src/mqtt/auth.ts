import type { AuthenticateError, Client, PublishPacket, Subscription } from "aedes" with { "resolution-mode": "import" };
import { findActiveBySubscribeId, touchLastConnected } from "../db/repositories/mqttSubscribeRepository";
import { safeCompareHash } from "../utils/crypto";
import { logger } from "../utils/logger";
// src/types/aedes.d.ts ทำ module augmentation ให้ aedes.Client อัตโนมัติ (รวมอยู่ใน
// tsconfig include glob แล้ว) ไม่ต้อง import ตรงนี้ (import เปล่าจะ compile เป็น
// require() ที่หาไฟล์ .js ไม่เจอ เพราะ .d.ts ไม่มี JS output ให้ emit)

// aedes เป็น declaration-only package (ESM-only, ไม่มี "require" export condition) จึง import
// ค่า runtime อย่าง AuthErrorCode ตรง ๆ จาก CommonJS ไม่ได้ (และ enum นี้ก็ไม่มี runtime object
// จริงให้ dynamic import ด้วยซ้ำ เป็นแค่ type declaration) — ใช้ค่าตัวเลขตาม MQTT CONNACK spec
// แทน: 4 = Bad username or password (เทียบเท่า aedes.AuthErrorCode.BAD_USERNAME_OR_PASSWORD)
const BAD_USERNAME_OR_PASSWORD = 4;

function authError(message: string): AuthenticateError {
  return Object.assign(new Error(message), { returnCode: BAD_USERNAME_OR_PASSWORD });
}

function topicPrefixOf(row: { hospcode: string; uid: string }): string {
  return `hospcode/${row.hospcode}/uid/${row.uid}`;
}

function isTopicAllowed(topicPrefix: string | undefined, topic: string): boolean {
  if (!topicPrefix) return false;
  return topic === topicPrefix || topic.startsWith(`${topicPrefix}/`);
}

// username = subscribe_id, password = subscribe_token (plaintext ที่ client ได้รับตอน
// POST /subscribe-requests) เทียบกับ token_hash ใน admin.mqtt_subscribe แบบ constant-time
export async function authenticate(
  client: Client,
  username: Readonly<string | undefined>,
  password: Readonly<Buffer | undefined>,
  done: (error: AuthenticateError | null, success: boolean | null) => void
): Promise<void> {
  try {
    if (!username || !password) {
      return done(authError("username/password required"), false);
    }

    const subscription = await findActiveBySubscribeId(username);
    if (!subscription || !safeCompareHash(subscription.token_hash, password.toString("utf8"))) {
      logger.warn("mqtt authenticate rejected", { clientId: client.id, subscribeId: username });
      return done(null, false);
    }

    client.subscribeId = subscription.subscribe_id;
    client.uid = subscription.uid;
    client.hospcode = subscription.hospcode;
    client.topicPrefix = topicPrefixOf(subscription);

    // อัปเดตแบบ fire-and-forget ไม่ block การตอบ CONNECT
    void touchLastConnected(subscription.subscribe_id).catch((err: Error) => {
      logger.error("failed to touch last_connected_at", { error: err.message });
    });

    done(null, true);
  } catch (err) {
    logger.error("mqtt authenticate error", { error: (err as Error).message });
    done(authError("authenticate failed"), false);
  }
}

// จำกัด subscribe ให้อยู่ใน topic namespace ของตัวเองเท่านั้น เช่น hospcode/{hospcode}/uid/{uid}/#
//
// สำคัญ: ต้อง reject ด้วย callback(null, null) ไม่ใช่ callback(new Error(...))
// เพราะ aedes จะ "ปิด connection ทั้งเส้น" ทันทีถ้า callback ได้ error (ดู
// node_modules/aedes/docs/Aedes.md หัวข้อ authorizeSubscribe) ซึ่งรุนแรงเกินไปสำหรับ
// กรณี subscribe ผิด topic เดียวในแพ็กเกจที่อาจมีหลาย topic — ส่ง subscription เป็น null
// แทน จะได้ SUBACK กลับไปด้วย return code 128 (ปฏิเสธเฉพาะ topic นั้น) โดย connection ไม่หลุด
export function authorizeSubscribe(
  client: Client,
  subscription: Subscription,
  callback: (error: Error | null, subscription?: Subscription | null) => void
): void {
  if (!isTopicAllowed(client.topicPrefix, subscription.topic)) {
    logger.warn("mqtt subscribe rejected", { clientId: client.id, topic: subscription.topic });
    return callback(null, null);
  }
  callback(null, subscription);
}

// จำกัด publish ด้วยเงื่อนไขเดียวกับ authorizeSubscribe
//
// ต่างจาก authorizeSubscribe: MQTT 3.1.1 ไม่มี reason code ระดับ per-publish ให้ตอบกลับ
// (ไม่เหมือน SUBACK 128) aedes จึงออกแบบให้ authorizePublish reject ด้วย error แล้วปิด
// connection ทันที (ตาม MQTT-3.3.5-2) — เป็นพฤติกรรมที่ตั้งใจและสอดคล้องกับ spec ไม่ใช่ bug
export function authorizePublish(
  client: Client | null,
  packet: PublishPacket,
  callback: (error?: Error | null) => void
): void {
  if (!client || !isTopicAllowed(client.topicPrefix, packet.topic)) {
    return callback(new Error(`unauthorized: cannot publish to "${packet.topic}"`));
  }
  callback();
}
