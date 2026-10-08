import { db } from "../knex";
import type { AccessCodeRow } from "../../types";

// admin.access_code เป็นตารางเดิม อ่านอย่างเดียว ไม่มี migration ของ service นี้
export async function findAccessCodeByCode(code: string): Promise<AccessCodeRow | null> {
  const row = await db<AccessCodeRow>("access_code")
    .select("code", "uid", "hospcode", "date", "expire", "isactive")
    .where({ code })
    .first();
  return row ?? null;
}
