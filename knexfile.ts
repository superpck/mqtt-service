import "dotenv/config";
import type { Knex } from "knex";

// knexfile แยกต่างหากจาก src/config/env.ts เพราะ knex CLI (migrate:*) โหลดไฟล์นี้ตรง ๆ
// ก่อนที่แอปจะ bootstrap ผ่าน src/index.ts
const knexConfig: Record<string, Knex.Config> = {
  development: {
    client: process.env.DB_CLIENT || "mysql2",
    connection: {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    },
    pool: {
      min: Number(process.env.DB_POOL_MIN) || 2,
      max: Number(process.env.DB_POOL_MAX) || 10,
    },
    migrations: {
      directory: "./src/db/migrations",
      extension: "ts",
      tableName: "knex_migrations",
    },
  },
};

// ใช้ config เดียวกันทุก environment ในตอนนี้ (ต่าง environment ต่างกันที่ค่าใน .env)
knexConfig.production = knexConfig.development;
knexConfig.test = knexConfig.development;

export default knexConfig;
