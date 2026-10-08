import dayjs from "dayjs";
import { config } from "../config/env";
import { generateSubscribeId, generateSubscribeToken, hashToken } from "../utils/crypto";
import { insertMqttSubscribe } from "../db/repositories/mqttSubscribeRepository";
import { validateAccessCode } from "./accessCodeService";

export interface CreateSubscriptionResult {
  subscribeId: string;
  subscribeToken: string;
  topic: string;
  expireAt: string;
  mqtt: {
    host: string;
    tcpPort: number;
    tlsPort: number | null;
    wsPort: number;
    wsPath: string;
  };
}

// topic namespace ตาม hospcode/uid ใช้บังคับ authorizeSubscribe/authorizePublish ฝั่ง broker
function buildTopic(hospcode: string, uid: string): string {
  return `hospcode/${hospcode}/uid/${uid}/#`;
}

// ขั้นตอน 3.3: สร้าง subscribe_id + token ใหม่เสมอ (ไม่ upsert) แล้วบันทึกลง admin.mqtt_subscribe
export async function createSubscription(
  code: string,
  clientLabel: string | null
): Promise<CreateSubscriptionResult> {
  const accessCode = await validateAccessCode(code);

  const subscribeId = generateSubscribeId();
  const subscribeToken = generateSubscribeToken();
  const topic = buildTopic(accessCode.hospcode, accessCode.uid);
  const expireAt = dayjs(accessCode.expire).toDate();

  await insertMqttSubscribe({
    subscribeId,
    tokenHash: hashToken(subscribeToken),
    code: accessCode.code,
    uid: accessCode.uid,
    hospcode: accessCode.hospcode,
    topic,
    clientLabel,
    expireAt,
  });

  return {
    subscribeId,
    subscribeToken,
    topic,
    expireAt: dayjs(expireAt).toISOString(),
    mqtt: {
      host: config.mqtt.publicHost,
      tcpPort: config.mqtt.tcpPort,
      tlsPort: config.mqtt.tlsEnabled ? config.mqtt.tlsPort : null,
      wsPort: config.mqtt.wsPort,
      wsPath: config.mqtt.wsPath,
    },
  };
}
