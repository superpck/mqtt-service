import "dotenv/config";
import { config } from "./config/env";
import { logger } from "./utils/logger";
import { db } from "./db/knex";
import { startHttpServer } from "./http/server";
import { startMqttBroker } from "./mqtt/broker";
import { startMqttEventWriter, stopMqttEventWriter } from "./jobs/mqttEventWriter";
import {
  startPartitionMaintenanceSchedule,
  stopPartitionMaintenanceSchedule,
} from "./jobs/mqttEventPartitionRotation";
import { startExpireSubscribeSweeper, stopExpireSubscribeSweeper } from "./jobs/expireSubscribeSweeper";

async function main(): Promise<void> {
  logger.info("mqtt-service starting", { nodeEnv: config.nodeEnv });

  // background jobs ไม่ block การ start ของ HTTP/MQTT listener
  startMqttEventWriter();
  startExpireSubscribeSweeper();
  startPartitionMaintenanceSchedule();

  const broker = await startMqttBroker();
  const httpServer = await startHttpServer();

  logger.info("mqtt-service started");

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("mqtt-service shutting down", { signal });

    try {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      stopPartitionMaintenanceSchedule();
      stopExpireSubscribeSweeper();
      await broker.close();
      // flush buffer ที่เหลือก่อนปิด DB pool กันข้อมูล publish ล่าสุดหาย
      await stopMqttEventWriter();
      await db.destroy();
      logger.info("mqtt-service shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error("error during shutdown", { error: (err as Error).message });
      process.exit(1);
    }
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("mqtt-service failed to start", { error: (err as Error).message });
  process.exit(1);
});
