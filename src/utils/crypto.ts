import { randomUUID, randomBytes, createHash, timingSafeEqual } from "node:crypto";

export function generateSubscribeId(): string {
  return randomUUID();
}

export function generateSubscribeToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// เทียบ token ที่ client ส่งมากับ hash ที่เก็บไว้ แบบ constant-time กันโจมตี timing attack
export function safeCompareHash(expectedHash: string, actualToken: string): boolean {
  const actualHash = hashToken(actualToken);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
