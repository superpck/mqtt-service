import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config/env";

export class JwtVerificationError extends Error {}

// verify เท่านั้น (ไม่ออก token เอง) เพราะ JWT มาจากระบบ auth ภายนอก
// ระบุ algorithms allowlist ชัดเจนกัน alg confusion / "alg: none" attack
export function verifyJwt(token: string): JwtPayload {
  let decoded: JwtPayload | string;
  try {
    decoded = jwt.verify(token, config.jwt.secret, { algorithms: [config.jwt.algorithm] });
  } catch (err) {
    throw new JwtVerificationError(err instanceof Error ? err.message : "invalid token");
  }
  if (typeof decoded === "string") {
    throw new JwtVerificationError("unexpected token payload");
  }
  return decoded;
}

export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1] : null;
}
