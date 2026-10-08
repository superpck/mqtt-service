import { readFileSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createTcpServer, type Server as TcpServer } from "node:net";
import { createServer as createTlsServer, type Server as TlsServer } from "node:tls";
import type { Aedes } from "aedes" with { "resolution-mode": "import" };
import { WebSocketServer, createWebSocketStream } from "ws";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { authenticate, authorizePublish, authorizeSubscribe } from "./auth";
import { recordEvent } from "./eventLogger";
// src/types/aedes.d.ts ทำ module augmentation ให้ aedes.Client อัตโนมัติ (รวมอยู่ใน
// tsconfig include glob แล้ว) ไม่ต้อง import ตรงนี้ (import เปล่าจะ compile เป็น
// require() ที่หาไฟล์ .js ไม่เจอ เพราะ .d.ts ไม่มี JS output ให้ emit)

export interface MqttBrokerHandle {
  aedes: Aedes;
  close: () => Promise<void>;
}

function listen(server: { listen: (port: number, host: string, cb: () => void) => unknown }, port: number, host: string): Promise<void> {
  return new Promise((resolve) => {
    server.listen(port, host, resolve);
  });
}

export async function startMqttBroker(): Promise<MqttBrokerHandle> {
  // aedes เป็น ESM-only package (ไม่มี "require" export condition) จึง import แบบ static
  // ไม่ได้ในไฟล์ CommonJS นี้ ต้องใช้ dynamic import() ซึ่ง Node รองรับเสมอไม่ว่า module
  // ปลายทางจะเป็น ESM หรือ CJS
  const { Aedes: AedesCtor } = await import("aedes");
  const aedes: Aedes = await AedesCtor.createBroker({ authenticate, authorizeSubscribe, authorizePublish });

  // ขั้นตอน 3.4: log ทุก publish message เต็มรูปแบบ + connect/disconnect ลง buffer
  // (jobs/mqttEventWriter.ts จะ flush เป็น batch insert ลง admin.mqtt_event)
  aedes.on("clientReady", (client) => {
    logger.info("mqtt client connected", { clientId: client.id, subscribeId: client.subscribeId });
    if (!client.subscribeId) return;
    recordEvent({
      subscribe_id: client.subscribeId,
      uid: client.uid ?? null,
      hospcode: client.hospcode ?? null,
      client_id: client.id,
      topic: client.topicPrefix ?? "",
      direction: "connect",
      qos: 0,
      retain: 0,
      payload: null,
      created_at: new Date(),
    });
  });

  aedes.on("clientDisconnect", (client) => {
    logger.info("mqtt client disconnected", { clientId: client.id, subscribeId: client.subscribeId });
    if (!client.subscribeId) return;
    recordEvent({
      subscribe_id: client.subscribeId,
      uid: client.uid ?? null,
      hospcode: client.hospcode ?? null,
      client_id: client.id,
      topic: client.topicPrefix ?? "",
      direction: "disconnect",
      qos: 0,
      retain: 0,
      payload: null,
      created_at: new Date(),
    });
  });

  aedes.on("publish", (packet, client) => {
    // client เป็น null สำหรับ publish ที่เกิดขึ้นภายใน broker เอง (เช่น $SYS topics) ข้ามไป
    if (!client || !client.subscribeId) return;
    recordEvent({
      subscribe_id: client.subscribeId,
      uid: client.uid ?? null,
      hospcode: client.hospcode ?? null,
      client_id: client.id,
      topic: packet.topic,
      direction: "publish",
      qos: packet.qos,
      retain: packet.retain ? 1 : 0,
      payload: packet.payload && packet.payload.length > 0 ? packet.payload.toString("utf8") : null,
      created_at: new Date(),
    });
  });

  const tcpServer: TcpServer = createTcpServer(aedes.handle);
  await listen(tcpServer, config.mqtt.tcpPort, config.mqtt.host);
  logger.info("mqtt tcp listener started", { port: config.mqtt.tcpPort, host: config.mqtt.host });

  let tlsServer: TlsServer | null = null;
  if (config.mqtt.tlsEnabled) {
    tlsServer = createTlsServer(
      {
        key: readFileSync(config.mqtt.tlsKeyPath),
        cert: readFileSync(config.mqtt.tlsCertPath),
      },
      aedes.handle
    );
    await listen(tlsServer, config.mqtt.tlsPort, config.mqtt.host);
    logger.info("mqtt tls listener started", { port: config.mqtt.tlsPort, host: config.mqtt.host });
  }

  // WebSocket transport: wrap ws connection เป็น Duplex stream แล้วส่งให้ aedes.handle เหมือน TCP ปกติ
  const wsHttpServer: HttpServer = createHttpServer();
  const wss = new WebSocketServer({ server: wsHttpServer, path: config.mqtt.wsPath });
  wss.on("connection", (ws, req) => {
    const stream = createWebSocketStream(ws);
    aedes.handle(stream, req);
  });
  await listen(wsHttpServer, config.mqtt.wsPort, config.mqtt.host);
  logger.info("mqtt websocket listener started", {
    port: config.mqtt.wsPort,
    path: config.mqtt.wsPath,
    host: config.mqtt.host,
  });

  async function close(): Promise<void> {
    await new Promise<void>((resolve) => tcpServer.close(() => resolve()));
    if (tlsServer) {
      await new Promise<void>((resolve) => (tlsServer as TlsServer).close(() => resolve()));
    }
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => wsHttpServer.close(() => resolve()));
    await new Promise<void>((resolve) => aedes.close(() => resolve()));
  }

  return { aedes, close };
}
