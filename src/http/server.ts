import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { sendJson } from "./respond";
import { handleHealth } from "./routes/health";
import { handleSubscribeRequest } from "./routes/subscribeRequests";

// เปิด CORS ให้เรียกจาก browser app (เช่น Angular ตอน dev ที่ ng serve คนละ origin กับ API นี้)
// ใช้ header ตรง ๆ แทนการพึ่ง library เพราะ endpoint มีไม่กี่เส้นทาง
function applyCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", config.http.corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

async function router(req: IncomingMessage, res: ServerResponse): Promise<void> {
  applyCorsHeaders(res);

  // Angular (fetch/HttpClient) ส่ง preflight OPTIONS มาก่อนเสมอ เพราะ request มี
  // header "authorization" ที่ไม่ใช่ CORS-safelisted header
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const { pathname } = url;

  try {
    if (req.method === "GET" && pathname === "/health") {
      handleHealth(req, res);
      return;
    }
    if (req.method === "POST" && pathname === "/subscribe-requests") {
      await handleSubscribeRequest(req, res);
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  } catch (err) {
    logger.error("unhandled http error", { error: (err as Error).message, pathname });
    if (!res.headersSent) {
      sendJson(res, 500, { error: "internal_error" });
    }
  }
}

export function startHttpServer(): Promise<Server> {
  const server = createServer((req, res) => {
    void router(req, res);
  });

  return new Promise<Server>((resolve) => {
    server.listen(config.http.port, config.http.host, () => {
      logger.info("http server listening", { port: config.http.port, host: config.http.host });
      resolve(server);
    });
  });
}
