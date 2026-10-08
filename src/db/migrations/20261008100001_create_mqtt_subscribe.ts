import type { Knex } from "knex";

// admin.mqtt_subscribe: 1 แถวต่อ 1 session ของอุปกรณ์ (multi-session รองรับโดยไม่มี
// unique constraint บน uid+hospcode — ดู design/mqtt-broker-design.md ข้อ 4.2)
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("mqtt_subscribe", (table) => {
    table.bigIncrements("id").primary();
    table.string("subscribe_id", 36).notNullable();
    table.string("token_hash", 64).notNullable();
    table.string("code", 64).notNullable();
    table.string("uid", 64).notNullable();
    table.string("hospcode", 16).notNullable();
    table.string("topic", 255).notNullable();
    table.string("client_label", 128).nullable();
    table.tinyint("is_active").notNullable().defaultTo(1);
    table.datetime("expire_at").notNullable();
    table.datetime("last_connected_at").nullable();
    table.datetime("created_at").notNullable().defaultTo(knex.fn.now());
    table.datetime("revoked_at").nullable();
    table.string("revoked_reason", 255).nullable();

    // hot path: authenticate hook ของ aedes lookup ด้วย subscribe_id ทุกครั้งที่ CONNECT
    table.unique("subscribe_id", { indexName: "uq_mqtt_subscribe_subscribe_id" });
    table.index(["uid", "hospcode", "is_active"], "idx_mqtt_subscribe_uid_hospcode_active");
    table.index(["expire_at"], "idx_mqtt_subscribe_expire_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("mqtt_subscribe");
}
