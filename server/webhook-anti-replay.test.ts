import { describe, expect, it } from "vitest";
import {
  createWebhookSignature,
  newWebhookNonce,
  validateWebhookReplay,
} from "./webhook-anti-replay";

describe("webhook anti-replay", () => {
  const now = new Date("2026-09-30T19:00:00.000Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const nonce = "nonce-0123456789abcdef";
  const body = JSON.stringify({ eventId: "event-1", content: "hello" });

  it("accepts a fresh signed request", () => {
    const signature = createWebhookSignature({ secret: "secret", body, timestamp, nonce });
    expect(validateWebhookReplay({
      secret: "secret",
      body,
      headers: { timestamp, nonce, signature },
      now,
    })).toMatchObject({ ok: true, nonce });
  });

  it("rejects stale, malformed and tampered requests", () => {
    const signature = createWebhookSignature({ secret: "secret", body, timestamp, nonce });
    expect(validateWebhookReplay({
      secret: "secret",
      body,
      headers: { timestamp: String(Number(timestamp) - 301), nonce, signature },
      now,
    })).toMatchObject({ ok: false, reason: "stale_timestamp" });
    expect(validateWebhookReplay({
      secret: "secret",
      body: "{}",
      headers: { timestamp, nonce, signature },
      now,
    })).toMatchObject({ ok: false, reason: "invalid_signature" });
    expect(validateWebhookReplay({
      secret: "secret",
      body,
      headers: { timestamp, nonce: "short", signature },
      now,
    })).toMatchObject({ ok: false, reason: "invalid_nonce" });
  });

  it("generates nonces that satisfy the transport contract", () => {
    const nonce = newWebhookNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9._:-]{16,180}$/);
  });
});
