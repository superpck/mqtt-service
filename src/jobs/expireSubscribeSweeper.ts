import { config } from "../config/env";
import { logger } from "../utils/logger";
import { sweepExpiredSubscriptions } from "../db/repositories/mqttSubscribeRepository";

let timer: NodeJS.Timeout | null = null;

async function sweepOnce(): Promise<void> {
  try {
    const affected = await sweepExpiredSubscriptions();
    if (affected > 0) {
      logger.info("swept expired mqtt_subscribe rows", { affected });
    }
  } catch (err) {
    logger.error("expire subscribe sweep failed", { error: (err as Error).message });
  }
}

export function startExpireSubscribeSweeper(): void {
  if (timer) return;
  void sweepOnce();
  timer = setInterval(() => {
    void sweepOnce();
  }, config.subscribe.expireSweepIntervalMs);
  timer.unref();
  logger.info("expire subscribe sweeper started", { intervalMs: config.subscribe.expireSweepIntervalMs });
}

export function stopExpireSubscribeSweeper(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
