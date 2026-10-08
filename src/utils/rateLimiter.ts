import { config } from "../config/env";

interface Bucket {
  count: number;
  windowStart: number;
}

// Fixed-window rate limiter แบบ in-memory ง่าย ๆ พอสำหรับ 1 process
// (ถ้า scale เป็นหลาย instance ในอนาคตต้องย้ายไป Redis)
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number
  ) {}

  consume(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (bucket.count >= this.max) {
      return false;
    }
    bucket.count += 1;
    return true;
  }

  // ล้าง bucket ที่หมดอายุเป็นระยะ กัน memory โตไม่จำกัดจาก IP แปลกใหม่จำนวนมาก
  sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}

export const subscribeRateLimiter = new FixedWindowRateLimiter(
  config.subscribe.rateLimitWindowMs,
  config.subscribe.rateLimitMax
);

const sweepTimer = setInterval(() => subscribeRateLimiter.sweep(), config.subscribe.rateLimitWindowMs);
sweepTimer.unref();
