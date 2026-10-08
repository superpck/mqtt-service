import { config } from "../config/env";
import { logger } from "../utils/logger";
import type { MqttEventRecord } from "../types";

// in-memory buffer: aedes event handler push เข้ามาเร็วมาก (สูงสุด ~10,000/sec)
// ต้องไม่ insert ลง DB ทีละแถว — jobs/mqttEventWriter.ts จะ drain ไปเขียนเป็น batch
let buffer: MqttEventRecord[] = [];

export function recordEvent(event: MqttEventRecord): void {
  if (buffer.length >= config.mqttEvent.bufferMaxSize) {
    // DB เขียนไม่ทัน (backpressure) ยอมทิ้งแถวเก่าสุดแทนที่จะปล่อยให้ memory โตไม่จำกัด
    buffer.shift();
    logger.warn("mqtt_event buffer overflow, dropping oldest event", {
      bufferMaxSize: config.mqttEvent.bufferMaxSize,
    });
  }
  buffer.push(event);
}

export function drain(maxSize: number): MqttEventRecord[] {
  const chunk = buffer.slice(0, maxSize);
  buffer = buffer.slice(chunk.length);
  return chunk;
}

export function bufferSize(): number {
  return buffer.length;
}
