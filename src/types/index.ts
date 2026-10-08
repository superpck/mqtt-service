// แถวจาก admin.access_code (ตารางเดิม อ่านอย่างเดียว ไม่สร้าง migration)
export interface AccessCodeRow {
  code: string;
  uid: string;
  hospcode: string;
  date: Date;
  expire: Date;
  isactive: number; // mysql2 คืน TINYINT เป็น number เสมอ ไม่ใช่ boolean
}

// แถวจาก admin.mqtt_subscribe
export interface MqttSubscribeRow {
  id: number;
  subscribe_id: string;
  token_hash: string;
  code: string;
  uid: string;
  hospcode: string;
  topic: string;
  client_label: string | null;
  is_active: number;
  expire_at: Date;
  last_connected_at: Date | null;
  created_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
}

export type MqttEventDirection = "publish" | "connect" | "disconnect";

// แถว/record ที่จะ insert ลง admin.mqtt_event (ผ่าน batch writer)
export interface MqttEventRecord {
  subscribe_id: string | null;
  uid: string | null;
  hospcode: string | null;
  client_id: string;
  topic: string;
  direction: MqttEventDirection;
  qos: number;
  retain: number;
  payload: string | null;
  created_at: Date;
}
