import http from "node:http";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { config } from "./config.js";
import { parseBaileysInstanceSettings } from "./instance-settings.js";
import type { InstanceRegistry } from "./instance-registry.js";
import { isAllowedOutboundMediaUrl } from "./media-reference.js";
import { SendLedgerError } from "./send-ledger.js";

export function createServer(registry: InstanceRegistry) {
  return http.createServer(async (req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`
    );
    if (req.method === "GET" && url.pathname === "/health")
      return json(res, 200, { status: "ok", service: "forte-whatsapp" });
    if (req.method === "GET" && url.pathname === "/ready") {
      const instances = registry.list();
      const defaultInstance =
        registry.get(config.instanceId)?.getStatus() ?? instances[0];
      const ready = !defaultInstance || defaultInstance.status !== "error";
      return json(res, ready ? 200 : 503, {
        status: ready ? "ready" : "not_ready",
        instance: defaultInstance ?? null,
        instances: instances.map(({ qr: _qr, ...instance }) => instance),
      });
    }
    if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

    try {
      const collectionPath = "/api/instances";
      if (req.method === "GET" && url.pathname === collectionPath)
        return json(res, 200, registry.list());
      if (req.method === "POST" && url.pathname === collectionPath) {
        const body = await readJson(req);
        const instanceId = String(body.instanceId ?? "");
        const name = String(body.name ?? "");
        if (!instanceId || !name)
          return json(res, 400, { error: "instance_id_and_name_required" });
        return json(res, 201, await registry.create(instanceId, name));
      }

      if (!url.pathname.startsWith(`${collectionPath}/`))
        return json(res, 404, { error: "not_found" });
      const [encodedId, action] = url.pathname
        .slice(collectionPath.length + 1)
        .split("/");
      if (!encodedId) return json(res, 404, { error: "not_found" });
      let instanceId: string;
      try {
        instanceId = decodeURIComponent(encodedId);
      } catch {
        return json(res, 400, { error: "invalid_instance_id" });
      }
      const manager = registry.get(instanceId);
      if (!manager) return json(res, 404, { error: "instance_not_found" });

      if (!action && req.method === "GET")
        return json(res, 200, manager.getStatus());
      if (action === "qr" && req.method === "GET") {
        const qr = await registry.qr(instanceId);
        if (!qr) return json(res, 404, { error: "qr_not_available" });
        return json(res, 200, {
          instanceId,
          imageDataUrl: await QRCode.toDataURL(qr, { width: 420, margin: 2 }),
        });
      }
      if (action === "profile" && req.method === "GET")
        return json(res, 200, await registry.profile(instanceId));
      if (action === "webhook-secret" && req.method === "PATCH") {
        const body = await readJson(req);
        const secret = typeof body.secret === "string" ? body.secret.trim() : "";
        if (secret.length < 32 || secret.length > 256)
          return json(res, 400, { error: "webhook_secret_length_invalid" });
        const status = registry.rotateWebhookSecret(instanceId, secret);
        return json(res, 200, { success: true, instanceId, status });
      }
      if (action === "settings" && req.method === "PATCH") {
        const body = await readJson(req);
        let settings;
        try {
          settings = parseBaileysInstanceSettings(body.settings);
        } catch (error) {
          return json(res, 400, {
            error:
              error instanceof Error
                ? error.message
                : "Configurações WhatsApp inválidas",
          });
        }
        return json(
          res,
          200,
          await registry.updateSettings(instanceId, settings)
        );
      }
      if (!action && req.method === "PATCH") {
        const body = await readJson(req);
        if (typeof body.name !== "string")
          return json(res, 400, { error: "name_required" });
        const updated = await registry.rename(instanceId, body.name);
        return json(res, 200, updated);
      }
      if (!action && req.method === "DELETE")
        return json(res, 200, await registry.remove(instanceId));
      if (action === "connect" && req.method === "POST") {
        const status = await registry.connect(instanceId);
        return json(res, 202, status);
      }
      if (action === "pairing-code" && req.method === "POST") {
        const body = await readJson(req);
        const phone = String(body.phone ?? "");
        if (!phone) return json(res, 400, { error: "phone_required" });
        const result = await registry.requestPairingCode(instanceId, phone);
        return json(res, 200, result);
      }
      if (action === "disconnect" && req.method === "POST")
        return json(res, 200, await registry.disconnect(instanceId, false));
      if (action === "logout" && req.method === "POST")
        return json(res, 200, await registry.disconnect(instanceId, true));
      if (action === "send-text" && req.method === "POST") {
        const idempotencyKey = requiredIdempotencyKey(req);
        if (!idempotencyKey)
          return json(res, 400, { error: "idempotency_key_required" });
        const body = await readJson(req);
        const phone = String(body.phone ?? body.jid ?? "");
        const text = String(body.text ?? body.message ?? "");
        if (!phone || !text)
          return json(res, 400, { error: "phone_and_text_required" });
        const externalId = await registry.sendMessage(
          instanceId,
          phone,
          "text",
          text,
          {},
          idempotencyKey
        );
        return json(res, 200, { success: true, externalId, status: "sent" });
      }
      if (action === "send" && req.method === "POST") {
        const idempotencyKey = requiredIdempotencyKey(req);
        if (!idempotencyKey)
          return json(res, 400, { error: "idempotency_key_required" });
        const body = await readJson(req);
        const phone = String(body.phone ?? body.jid ?? "");
        const messageType = String(body.messageType ?? body.type ?? "text");
        const content = String(body.content ?? body.url ?? body.text ?? "");
        const metadata =
          body.metadata && typeof body.metadata === "object"
            ? (body.metadata as Record<string, unknown>)
            : body;
        if (!phone) return json(res, 400, { error: "phone_required" });
        if (
          ["image", "audio", "video", "document"].includes(messageType) &&
          (!isAllowedOutboundMediaUrl(content) || typeof metadata.mediaData === "string")
        )
          return json(res, 400, { error: "private_https_media_url_required" });
        if (body.payload && typeof body.payload === "object") {
          const externalId = await registry.sendPayload(
            instanceId,
            phone,
            body.payload as never,
            idempotencyKey
          );
          return json(res, 200, {
            success: true,
            externalId,
            status: "sent",
            messageType: "payload",
          });
        }
        if (!content)
          return json(res, 400, {
            error: "phone_and_content_or_payload_required",
          });
        const externalId = await registry.sendMessage(
          instanceId,
          phone,
          messageType,
          content,
          metadata,
          idempotencyKey
        );
        return json(res, 200, {
          success: true,
          externalId,
          status: "sent",
          messageType,
        });
      }
      return json(res, 404, { error: "not_found" });
    } catch (error) {
      if (error instanceof SendLedgerError)
        return json(res, error.code === "idempotency_conflict" ? 409 : 425, {
          error: error.code,
          message: error.message,
        });
      const message =
        error instanceof Error ? error.message : "gateway_request_failed";
      const status = message.includes("não encontrada") ? 404 : 400;
      return json(res, status, { error: "gateway_request_failed", message });
    }
  });
}

function authorized(req: http.IncomingMessage) {
  const provided = req.headers.authorization ?? "";
  const expected = `Bearer ${config.apiKey}`;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function requiredIdempotencyKey(req: http.IncomingMessage) {
  const value = req.headers["idempotency-key"];
  if (typeof value !== "string") return undefined;
  const key = value.trim();
  return key.length >= 8 && key.length <= 180 ? key : undefined;
}

function json(res: http.ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function readJson(
  req: http.IncomingMessage
): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? (JSON.parse(body) as Record<string, unknown>) : {};
}
