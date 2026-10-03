import http from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baileysWebhookAuthenticationGuard } from "./baileys-webhook-ingress";
import { BAILEYS_WEBHOOK_MAX_BODY_BYTES } from "./media-limits";

let server: http.Server;
let baseUrl = "";
let handlerCalls = 0;
const previousApiKey = process.env.FORTE_API_KEY;
const previousWebhookSecret = process.env.BAILEYS_WEBHOOK_SECRET;

beforeAll(async () => {
  process.env.FORTE_API_KEY = "ingress-test-api-key";
  process.env.BAILEYS_WEBHOOK_SECRET = "ingress-test-webhook-secret";
  const app = express();
  app.use(
    "/webhook",
    baileysWebhookAuthenticationGuard,
    express.json({ limit: BAILEYS_WEBHOOK_MAX_BODY_BYTES })
  );
  app.post("/webhook", (req, res) => {
    handlerCalls += 1;
    return res.status(200).json({ parsed: req.body });
  });
  await new Promise<void>(resolve => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string")
        baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  if (previousApiKey === undefined) delete process.env.FORTE_API_KEY;
  else process.env.FORTE_API_KEY = previousApiKey;
  if (previousWebhookSecret === undefined)
    delete process.env.BAILEYS_WEBHOOK_SECRET;
  else process.env.BAILEYS_WEBHOOK_SECRET = previousWebhookSecret;
});

function oversizedRequest() {
  return new Promise<number>((resolve, reject) => {
    const request = http.request(
      `${baseUrl}/webhook`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer ingress-test-api-key",
          "Content-Type": "application/json",
          "Content-Length": String(BAILEYS_WEBHOOK_MAX_BODY_BYTES + 1),
        },
      },
      response => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      }
    );
    request.on("error", reject);
    request.end();
  });
}

describe("Baileys webhook ingress guard", () => {
  it("rejects an oversized Content-Length before the JSON parser", async () => {
    const before = handlerCalls;
    await expect(oversizedRequest()).resolves.toBe(413);
    expect(handlerCalls).toBe(before);
  });

  it("rejects unauthenticated requests before parsing the body", async () => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "unauthorized" }),
    });
    expect(response.status).toBe(401);
    expect(handlerCalls).toBe(0);
  });

  it("accepts a gateway secret and parses a bounded request", async () => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": "ingress-test-webhook-secret",
      },
      body: JSON.stringify({ eventId: "bounded-event" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      parsed: { eventId: "bounded-event" },
    });
    expect(handlerCalls).toBe(1);
  });
});
