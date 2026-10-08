import dayjs from "dayjs";
import { findAccessCodeByCode } from "../db/repositories/accessCodeRepository";
import type { AccessCodeRow } from "../types";

export type AccessCodeErrorReason = "not_found" | "inactive" | "not_started" | "expired";

export class AccessCodeError extends Error {
  constructor(
    public readonly reason: AccessCodeErrorReason,
    message: string
  ) {
    super(message);
  }
}

// ตรวจสอบ code ตามข้อ 3.2 ของ request.txt: code, uid, hospcode, date, expire, isactive
export async function validateAccessCode(code: string): Promise<AccessCodeRow> {
  const row = await findAccessCodeByCode(code);
  if (!row) {
    throw new AccessCodeError("not_found", "access code not found");
  }
  if (row.isactive !== 1) {
    throw new AccessCodeError("inactive", "access code is not active");
  }

  const now = dayjs();
  if (row.date && now.isBefore(dayjs(row.date))) {
    throw new AccessCodeError("not_started", "access code is not yet valid");
  }
  if (row.expire && now.isAfter(dayjs(row.expire))) {
    throw new AccessCodeError("expired", "access code has expired");
  }

  return row;
}
