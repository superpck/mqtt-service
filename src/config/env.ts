import "dotenv/config";
import type { Algorithm } from "jsonwebtoken";

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",

  http: {
    port: toInt(process.env.PORT, 3001),
    host: process.env.HOST ?? "0.0.0.0",
    // origin ที่อนุญาตให้เรียก API ข้าม origin ได้ (เช่น เว็บ Angular ตอน dev ที่ ng serve
    // คนละพอร์ตกับ API นี้) ค่าเริ่มต้น "*" เพื่อให้ dev ง่าย ปรับให้ระบุ origin จริงใน production
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
  },

  // JWT ออกโดยระบบ auth ภายนอก service นี้ทำหน้าที่ verify เท่านั้น
  jwt: {
    secret: required("SECRET_KEY", process.env.SECRET_KEY),
    algorithm: (process.env.JWT_ALGORITHM ?? "HS256") as Algorithm,
  },

  db: {
    client: process.env.DB_CLIENT ?? "mysql2",
    host: process.env.DB_HOST ?? "localhost",
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD ?? "",
    name: required("DB_NAME", process.env.DB_NAME),
    poolMin: toInt(process.env.DB_POOL_MIN, 2),
    poolMax: toInt(process.env.DB_POOL_MAX, 10),
  },

  mqtt: {
    host: process.env.MQTT_HOST ?? "0.0.0.0",
    tcpPort: toInt(process.env.MQTT_TCP_PORT, 1883),
    tlsEnabled: toBool(process.env.MQTT_TLS_ENABLED, false),
    tlsPort: toInt(process.env.MQTT_TLS_PORT, 8883),
    tlsKeyPath: process.env.MQTT_TLS_KEY_PATH ?? "",
    tlsCertPath: process.env.MQTT_TLS_CERT_PATH ?? "",
    wsPort: toInt(process.env.MQTT_WS_PORT, 8083),
    wsPath: process.env.MQTT_WS_PATH ?? "/mqtt",
    // host ที่ตอบกลับไปให้ client เอาไปต่อจริง อาจต่างจาก MQTT_HOST ที่ใช้ bind (0.0.0.0)
    publicHost: process.env.MQTT_PUBLIC_HOST ?? "localhost",
  },

  // tuning สำหรับ admin.mqtt_event ที่ volume สูง (ดู design/mqtt-broker-design.md ข้อ 4.4)
  mqttEvent: {
    retentionDays: toInt(process.env.MQTT_EVENT_RETENTION_DAYS, 90),
    partitionBufferDays: toInt(process.env.MQTT_EVENT_PARTITION_BUFFER_DAYS, 10),
    partitionLookaheadDays: toInt(process.env.MQTT_EVENT_PARTITION_LOOKAHEAD_DAYS, 3),
    partitionMaintenanceHour: toInt(process.env.MQTT_EVENT_PARTITION_MAINTENANCE_HOUR, 2),
    flushIntervalMs: toInt(process.env.MQTT_EVENT_FLUSH_INTERVAL_MS, 200),
    flushMaxBatch: toInt(process.env.MQTT_EVENT_FLUSH_MAX_BATCH, 1000),
    bufferMaxSize: toInt(process.env.MQTT_EVENT_BUFFER_MAX_SIZE, 50000),
  },

  subscribe: {
    expireSweepIntervalMs: toInt(process.env.SUBSCRIBE_EXPIRE_SWEEP_INTERVAL_MS, 60000),
    rateLimitWindowMs: toInt(process.env.SUBSCRIBE_RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMax: toInt(process.env.SUBSCRIBE_RATE_LIMIT_MAX, 20),
  },
} as const;

if (config.mqtt.tlsEnabled && (!config.mqtt.tlsKeyPath || !config.mqtt.tlsCertPath)) {
  throw new Error(
    "MQTT_TLS_ENABLED=true requires both MQTT_TLS_KEY_PATH and MQTT_TLS_CERT_PATH to be set"
  );
}
