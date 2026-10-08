import type { Knex } from "knex";

// admin.mqtt_event: log ทุก publish message เต็มรูปแบบ ที่ volume สูงสุด ~10,000 msg/sec
// (5 msg/sec x 2,000 client) จึง partition รายวันแทน monthly เพื่อให้ DROP PARTITION
// ลบข้อมูลเก่าได้แบบ metadata-only — ดู design/mqtt-broker-design.md ข้อ 4.3-4.4
//
// ใช้ raw SQL ทั้งหมดเพราะ knex schema builder ไม่รองรับ PARTITION BY และ GENERATED COLUMN
const INITIAL_PARTITION_LOOKAHEAD_DAYS = 3;

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function partitionName(date: Date): string {
  return `p${toDateString(date).replace(/-/g, "")}`;
}

// สร้าง partition ล่วงหน้าไม่กี่วันตอน migration แรก ส่วนที่เหลือให้
// jobs/mqttEventPartitionRotation.ts ดูแลต่อเนื่องทุกวันหลังจาก service เริ่มทำงาน
function buildInitialPartitionsClause(daysAhead: number): string {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const clauses: string[] = [];
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const partitionDate = new Date(today.getTime() + offset * 86_400_000);
    const boundaryDate = new Date(today.getTime() + (offset + 1) * 86_400_000);
    clauses.push(
      `PARTITION ${partitionName(partitionDate)} VALUES LESS THAN ('${toDateString(boundaryDate)}')`
    );
  }
  clauses.push("PARTITION pmax VALUES LESS THAN (MAXVALUE)");
  return clauses.join(",\n      ");
}

export async function up(knex: Knex): Promise<void> {
  const partitionsClause = buildInitialPartitionsClause(INITIAL_PARTITION_LOOKAHEAD_DAYS);
  await knex.raw(`
    CREATE TABLE mqtt_event (
      id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      subscribe_id    CHAR(36)     NULL,
      uid             VARCHAR(64)  NULL,
      hospcode        VARCHAR(16)  NULL,
      client_id       VARCHAR(128) NOT NULL,
      topic           VARCHAR(255) NOT NULL,
      direction       ENUM('publish','connect','disconnect') NOT NULL DEFAULT 'publish',
      qos             TINYINT      NOT NULL DEFAULT 0,
      retain          TINYINT(1)   NOT NULL DEFAULT 0,
      payload         MEDIUMTEXT   NULL,
      created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      event_date      DATE GENERATED ALWAYS AS (DATE(created_at)) STORED,
      PRIMARY KEY (id, event_date),
      KEY idx_mqtt_event_subscribe_created (subscribe_id, created_at),
      KEY idx_mqtt_event_topic_created (topic, created_at)
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
    PARTITION BY RANGE COLUMNS (event_date) (
      ${partitionsClause}
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("mqtt_event");
}
