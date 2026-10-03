import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { getBaileysWebhookSecret } from "./db";
import { BAILEYS_WEBHOOK_MAX_BODY_BYTES } from "./media-limits";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function apiKeyMatches(req: Parameters<RequestHandler>[0]) {
  const expected = process.env.FORTE_API_KEY?.trim();
  const provided = req
    .header("Authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  return Boolean(expected && provided && safeEqual(provided, expected));
}

function reject(
  res: Parameters<RequestHandler>[1],
  status: number,
  error: string,
  message: string
) {
  return res.status(status).json({ error, message });
}

/**
 * Runs before any JSON parser on the provider webhook route. The gateway
 * sends the per-instance secret and instance id in headers as well as signing
 * the body, so malformed/oversized unauthenticated requests do not get a
 * large body materialized by Express.
 */
export const baileysWebhookAuthenticationGuard: RequestHandler = (
  req,
  res,
  next
) => {
  const rawLength = req.header("Content-Length");
  if (rawLength !== undefined) {
    const contentLength = Number(rawLength);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > BAILEYS_WEBHOOK_MAX_BODY_BYTES
    )
      return reject(
        res,
        413,
        "payload_too_large",
        "O payload do webhook Baileys excede o limite permitido"
      );
  }

  void (async () => {
    const providedSecret = req.header("X-Webhook-Secret")?.trim() ?? "";
    const instanceId = req.header("X-Webhook-Instance-Id")?.trim() ?? "";
    let expectedSecret = process.env.BAILEYS_WEBHOOK_SECRET?.trim() ?? "";
    if (instanceId) {
      expectedSecret =
        (await getBaileysWebhookSecret(instanceId).catch(() => undefined)) ??
        expectedSecret;
    }

    if (
      (providedSecret &&
        expectedSecret &&
        safeEqual(providedSecret, expectedSecret)) ||
      apiKeyMatches(req)
    )
      return next();

    if (!expectedSecret && !process.env.FORTE_API_KEY?.trim())
      return reject(
        res,
        503,
        "api_not_configured",
        "Nenhuma credencial de webhook/API está configurada"
      );
    return reject(res, 401, "unauthorized", "Credencial de webhook inválida");
  })().catch(next);
};
