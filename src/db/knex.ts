import knex, { type Knex } from "knex";
import { config } from "../config/env";

export const db: Knex = knex({
  client: config.db.client,
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
  },
  pool: {
    min: config.db.poolMin,
    max: config.db.poolMax,
  },
});
