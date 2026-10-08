import dayjs from "dayjs";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { dropPartitions, listPartitionNames, reorganizePmaxPartition } from "../db/repositories/mqttEventRepository";

const PARTITION_NAME_PATTERN = /^p(\d{8})$/;

function partitionNameForDate(date: dayjs.Dayjs): string {
  return `p${date.format("YYYYMMDD")}`;
}

// สร้าง partition ของวันถัดไปล่วงหน้าไว้เสมอ (ตามจำนวนวันใน MQTT_EVENT_PARTITION_LOOKAHEAD_DAYS)
// กัน insert พลาดเข้า pmax เป็นก้อนใหญ่ถ้า job ไม่ได้รันทันเวลา
async function ensureFuturePartitions(): Promise<void> {
  const existing = new Set(await listPartitionNames());
  const today = dayjs().startOf("day");

  for (let i = 1; i <= config.mqttEvent.partitionLookaheadDays; i += 1) {
    const day = today.add(i, "day");
    const name = partitionNameForDate(day);
    if (existing.has(name)) continue;

    const boundary = day.add(1, "day").format("YYYY-MM-DD");
    await reorganizePmaxPartition(name, boundary);
    existing.add(name);
    logger.info("created mqtt_event partition", { name, boundary });
  }
}

// DROP PARTITION ที่พ้น retention + buffer วัน (metadata operation เร็ว ไม่ใช่ DELETE)
async function dropOldPartitions(): Promise<void> {
  const cutoff = dayjs()
    .startOf("day")
    .subtract(config.mqttEvent.retentionDays + config.mqttEvent.partitionBufferDays, "day");

  const names = await listPartitionNames();
  const toDrop = names.filter((name) => {
    const match = PARTITION_NAME_PATTERN.exec(name);
    if (!match) return false; // ข้าม pmax
    return dayjs(match[1], "YYYYMMDD").isBefore(cutoff);
  });

  if (toDrop.length > 0) {
    await dropPartitions(toDrop);
    logger.info("dropped expired mqtt_event partitions", { partitions: toDrop });
  }
}

export async function runPartitionMaintenance(): Promise<void> {
  try {
    await ensureFuturePartitions();
    await dropOldPartitions();
  } catch (err) {
    logger.error("mqtt_event partition maintenance failed", { error: (err as Error).message });
  }
}

function msUntilNextRun(hour: number): number {
  const now = dayjs();
  let next = now.hour(hour).minute(0).second(0).millisecond(0);
  if (!next.isAfter(now)) {
    next = next.add(1, "day");
  }
  return next.diff(now);
}

let initialTimeout: NodeJS.Timeout | null = null;
let dailyInterval: NodeJS.Timeout | null = null;

export function startPartitionMaintenanceSchedule(): void {
  // รันทันทีตอน start กันกรณี service หยุดไปหลายวันแล้วยังไม่มี partition รองรับ
  void runPartitionMaintenance();

  const delay = msUntilNextRun(config.mqttEvent.partitionMaintenanceHour);
  initialTimeout = setTimeout(() => {
    void runPartitionMaintenance();
    dailyInterval = setInterval(() => {
      void runPartitionMaintenance();
    }, 24 * 60 * 60 * 1000);
    dailyInterval.unref();
  }, delay);
  initialTimeout.unref();
  logger.info("mqtt_event partition maintenance scheduled", { nextRunInMs: delay });
}

export function stopPartitionMaintenanceSchedule(): void {
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  if (dailyInterval) {
    clearInterval(dailyInterval);
    dailyInterval = null;
  }
}
