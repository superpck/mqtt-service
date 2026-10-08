// เก็บ context ของ client ที่ยืนยันตัวตนผ่าน admin.mqtt_subscribe แล้ว
// ไว้ใช้ตรวจสิทธิ์ subscribe/publish และ log event โดยไม่ต้อง query DB ซ้ำทุกครั้ง
//
// หมายเหตุ: ต้องมี `export {}` เพื่อบังคับให้ไฟล์นี้เป็น module ไม่ใช่ global script
// ไม่งั้น `declare module "aedes"` จะ "แทนที่" type ทั้งหมดของ aedes แทนที่จะ augment เพิ่ม
export {};

declare module "aedes" {
  interface Client {
    subscribeId?: string;
    uid?: string;
    hospcode?: string;
    /** topic prefix ที่ client นี้ได้รับอนุญาต เช่น hospcode/{hospcode}/uid/{uid} */
    topicPrefix?: string;
  }
}
