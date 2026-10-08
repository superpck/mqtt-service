import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson, readJsonBody } from "../respond";
import { extractBearerToken, verifyJwt, JwtVerificationError } from "../../utils/jwt";
import { subscribeRateLimiter } from "../../utils/rateLimiter";
import { createSubscription } from "../../services/subscribeService";
import { AccessCodeError, type AccessCodeErrorReason } from "../../services/accessCodeService";
import { logger } from "../../utils/logger";

const MAX_BODY_BYTES = 8 * 1024;

interface SubscribeRequestBody {
  code?: unknown;
  clientLabel?: unknown;
}

const ACCESS_CODE_HTTP_STATUS: Record<AccessCodeErrorReason, number> = {
  not_found: 403,
  inactive: 403,
  not_started: 403,
  expired: 403,
};

function getClientIp(req: IncomingMessage): string {
  return (req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");
}

// POST /subscribe-requests — ขั้นตอน 3.1-3.3 ของ request.txt
export async function handleSubscribeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ip = getClientIp(req);
  if (!subscribeRateLimiter.consume(ip)) {
    sendJson(res, 429, { error: "too_many_requests" });
    return;
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    sendJson(res, 401, { error: "missing_bearer_token" });
    return;
  }

  let jwtSubject: string | undefined;
  try {
    const decoded = verifyJwt(token);
    jwtSubject = typeof decoded.sub === "string" ? decoded.sub : undefined;
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      sendJson(res, 401, { error: "invalid_token" });
      return;
    }
    throw err;
  }

  let body: SubscribeRequestBody;
  try {
    body = await readJsonBody<SubscribeRequestBody>(req, MAX_BODY_BYTES);
  } catch {
    sendJson(res, 400, { error: "invalid_request_body" });
    return;
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code || code.length > 64) {
    sendJson(res, 400, { error: "code_required" });
    return;
  }
  const clientLabel = typeof body.clientLabel === "string" ? body.clientLabel.slice(0, 128) : null;

  try {
    const result = await createSubscription(code, clientLabel);
    logger.info("subscribe request granted", {
      subscribeId: result.subscribeId,
      jwtSubject,
      ip,
    });
    sendJson(res, 201, result);
  } catch (err) {
    if (err instanceof AccessCodeError) {
      sendJson(res, ACCESS_CODE_HTTP_STATUS[err.reason], { error: err.reason });
      return;
    }
    logger.error("failed to create subscription", { error: (err as Error).message });
    sendJson(res, 500, { error: "internal_error" });
  }
}
