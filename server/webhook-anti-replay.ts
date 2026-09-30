import crypto from "node:crypto";

const DEFAULT_WINDOW_SECONDS = 5 * 60;
const NONCE_PATTERN = /^[A-Za-z0-9._:-]{16,180}$/;

export type WebhookReplayHeaders = {
  timestamp: string;
  nonce: string;
  signature: string;
};

export type WebhookReplayValidation =
  | { ok: true; timestamp: Date; nonce: string }
  | { ok: false; reason: "missing_headers" | "invalid_timestamp" | "stale_timestamp" | "invalid_nonce" | "invalid_signature" };

export function webhookSigningInput(body: string, timestamp: string, nonce: string) {
  return `${timestamp}.${nonce}.${body}`;
}

export function createWebhookSignature(input: {
  secret: string;
  body: string;
  timestamp: string;
  nonce: string;
}) {
  return `sha256=${crypto
    .createHmac("sha256", input.secret)
    .update(webhookSigningInput(input.body, input.timestamp, input.nonce))
    .digest("hex")}`;
}

export function validateWebhookReplay(input: {
  secret: string;
  body: string;
  headers: WebhookReplayHeaders;
  now?: Date;
  windowSeconds?: number;
}): WebhookReplayValidation {
  const timestamp = input.headers.timestamp.trim();
  const nonce = input.headers.nonce.trim();
  const signature = input.headers.signature.trim();
  if (!input.secret || !timestamp || !nonce || !signature)
    return { ok: false, reason: "missing_headers" };
  if (!/^\d{10}$/.test(timestamp))
    return { ok: false, reason: "invalid_timestamp" };
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds))
    return { ok: false, reason: "invalid_timestamp" };
  const windowSeconds = Math.max(1, Math.min(input.windowSeconds ?? DEFAULT_WINDOW_SECONDS, 24 * 60 * 60));
  const ageSeconds = Math.abs(Math.floor((input.now?.getTime() ?? Date.now()) / 1000) - seconds);
  if (ageSeconds > windowSeconds)
    return { ok: false, reason: "stale_timestamp" };
  if (!NONCE_PATTERN.test(nonce))
    return { ok: false, reason: "invalid_nonce" };
  const expected = createWebhookSignature({ secret: input.secret, body: input.body, timestamp, nonce });
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
    return { ok: false, reason: "invalid_signature" };
  return { ok: true, timestamp: new Date(seconds * 1000), nonce };
}

export function newWebhookNonce() {
  return crypto.randomBytes(18).toString("base64url");
}
