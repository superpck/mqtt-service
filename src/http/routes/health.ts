import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../respond";

export function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { status: "ok" });
}
