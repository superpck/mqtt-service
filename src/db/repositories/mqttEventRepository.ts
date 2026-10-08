import { db } from "../knex";
import type { MqttEventRecord } from "../../types";

// batch insert หลายแถวในคำสั่งเดียว ใช้โดย jobs/mqttEventWriter.ts
// (ห้าม insert ทีละแถวที่ volume นี้ ดู design/mqtt-broker-design.md ข้อ 4.4)
export async function insertMqttEvents(events: MqttEventRecord[]): Promise<void> {
  if (events.length === 0) return;
  await db("mqtt_event").insert(events);
}

interface PartitionNameRow {
  name: string;
}

// คืนรายชื่อ partition ปัจจุบันของ mqtt_event เรียงตามลำดับ (รวม pmax)
export async function listPartitionNames(): Promise<string[]> {
  const result = await db.raw(
    `SELECT PARTITION_NAME AS name
     FROM INFORMATION_SCHEMA.PARTITIONS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mqtt_event' AND PARTITION_NAME IS NOT NULL
     ORDER BY PARTITION_ORDINAL_POSITION`
  );
  // mysql2 dialect คืน [rows, fields] จาก raw query ที่ไม่ match method select/first/...
  const [rows] = result as [PartitionNameRow[], unknown];
  return rows.map((row) => row.name);
}

// แยก partition pmax ออกเป็น partition ใหม่ 1 วัน + pmax เดิม (metadata operation, เร็ว)
export async function reorganizePmaxPartition(
  newPartitionName: string,
  boundaryDateExclusive: string
): Promise<void> {
  await db.raw(
    `ALTER TABLE mqtt_event REORGANIZE PARTITION pmax INTO (
       PARTITION ?? VALUES LESS THAN (?),
       PARTITION pmax VALUES LESS THAN (MAXVALUE)
     )`,
    [newPartitionName, boundaryDateExclusive]
  );
}

// DROP PARTITION เป็น metadata operation (ไม่ใช่ DELETE) เหมาะกับการลบข้อมูลเก่าที่ volume สูงมาก
export async function dropPartitions(partitionNames: string[]): Promise<void> {
  if (partitionNames.length === 0) return;
  const identifiers = partitionNames.map(() => "??").join(", ");
  await db.raw(`ALTER TABLE mqtt_event DROP PARTITION ${identifiers}`, partitionNames);
}
