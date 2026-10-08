import { config } from "../config/env";
import { logger } from "../utils/logger";
import { bufferSize, drain } from "../mqtt/eventLogger";
import { insertMqttEvents } from "../db/repositories/mqttEventRepository";

let timer: NodeJS.Timeout | null = null;
let flushing = false;

async function flushOnce(): Promise<void> {
  // กันกรณี flush รอบก่อนยังไม่เสร็จ (DB ช้ากว่า interval) ไม่ให้ยิง query ซ้อนกัน
  if (flushing) return;
  flushing = true;
  try {
    const batch = drain(config.mqttEvent.flushMaxBatch);
    if (batch.length > 0) {
      await insertMqttEvents(batch);
    }
  } catch (err) {
    // ยอมเสีย batch นี้ไปแทนที่จะ push กลับเข้า buffer กันกรณี error ซ้ำวนลูปไม่รู้จบ
    logger.error("failed to flush mqtt_event batch", { error: (err as Error).message });
  } finally {
    flushing = false;
  }
}

export function startMqttEventWriter(): void {
  if (timer) return;
  timer = setInterval(() => {
    void flushOnce();
  }, config.mqttEvent.flushIntervalMs);
  timer.unref();
  logger.info("mqtt_event writer started", { intervalMs: config.mqttEvent.flushIntervalMs });
}

// เรียกตอน graceful shutdown: flush buffer ที่เหลือให้หมดก่อนปิด DB pool กันข้อมูลล่าสุดหาย
export async function stopMqttEventWriter(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  while (bufferSize() > 0) {
    await flushOnce();
  }
  logger.info("mqtt_event writer stopped, buffer flushed");
}
