import { db } from "../knex";
import type { MqttSubscribeRow } from "../../types";

export interface InsertMqttSubscribeInput {
  subscribeId: string;
  tokenHash: string;
  code: string;
  uid: string;
  hospcode: string;
  topic: string;
  clientLabel: string | null;
  expireAt: Date;
}

// Insert แถวใหม่เสมอ (ไม่ upsert) เพื่อรองรับ multi-session: uid+hospcode เดียวกัน
// ขอ subscribe จากหลายอุปกรณ์พร้อมกันได้ โดยแต่ละอุปกรณ์ได้ subscribe_id ของตัวเอง
export async function insertMqttSubscribe(input: InsertMqttSubscribeInput): Promise<void> {
  await db("mqtt_subscribe").insert({
    subscribe_id: input.subscribeId,
    token_hash: input.tokenHash,
    code: input.code,
    uid: input.uid,
    hospcode: input.hospcode,
    topic: input.topic,
    client_label: input.clientLabel,
    expire_at: input.expireAt,
    is_active: 1,
  });
}

// hot path: เรียกทุกครั้งที่ MQTT client ส่ง CONNECT มา ต้องเร็ว (index บน subscribe_id)
export async function findActiveBySubscribeId(subscribeId: string): Promise<MqttSubscribeRow | null> {
  const row = await db<MqttSubscribeRow>("mqtt_subscribe")
    .where({ subscribe_id: subscribeId, is_active: 1 })
    .andWhere("expire_at", ">", db.fn.now())
    .first();
  return row ?? null;
}

export async function touchLastConnected(subscribeId: string): Promise<void> {
  await db("mqtt_subscribe")
    .where({ subscribe_id: subscribeId })
    .update({ last_connected_at: db.fn.now() });
}

// job กวาด mark session ที่หมดอายุแล้วเป็น inactive คืนจำนวนแถวที่ถูกอัปเดต
export async function sweepExpiredSubscriptions(): Promise<number> {
  return db("mqtt_subscribe")
    .where("is_active", 1)
    .andWhere("expire_at", "<", db.fn.now())
    .update({ is_active: 0, revoked_at: db.fn.now(), revoked_reason: "expired" });
}
