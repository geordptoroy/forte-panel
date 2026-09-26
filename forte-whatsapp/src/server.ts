import http from "node:http";
import QRCode from "qrcode";
import { config } from "./config.js";
import type { InstanceManager } from "./instance-manager.js";

export function createServer(manager: InstanceManager) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { status: "ok", service: "forte-whatsapp" });
    if (req.method === "GET" && url.pathname === "/ready") return json(res, 200, { status: "ready", instance: manager.getStatus() });
    if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
    if (req.method === "GET" && url.pathname === "/api/instances") return json(res, 200, [manager.getStatus()]);
    if (req.method === "GET" && url.pathname === `/api/instances/${config.instanceId}`) return json(res, 200, manager.getStatus());
    if (req.method === "GET" && url.pathname === `/api/instances/${config.instanceId}/qr`) {
      const qr = manager.getStatus().qr;
      if (!qr) return json(res, 404, { error: "qr_not_available" });
      return json(res, 200, { instanceId: config.instanceId, imageDataUrl: await QRCode.toDataURL(qr, { width: 420, margin: 2 }) });
    }
    if (req.method === "POST" && url.pathname === `/api/instances/${config.instanceId}/connect`) { await manager.start(); return json(res, 202, manager.getStatus()); }
    if (req.method === "POST" && url.pathname === `/api/instances/${config.instanceId}/disconnect`) { await manager.stop(); return json(res, 200, manager.getStatus()); }
    if (req.method === "POST" && url.pathname === `/api/instances/${config.instanceId}/logout`) { await manager.stop(true); return json(res, 200, manager.getStatus()); }
    if (req.method === "POST" && url.pathname === `/api/instances/${config.instanceId}/send-text`) {
      const body = await readJson(req);
      const phone = String(body.phone ?? body.jid ?? "");
      const text = String(body.text ?? body.message ?? "");
      if (!phone || !text) return json(res, 400, { error: "phone_and_text_required" });
      const externalId = await manager.sendText(phone, text);
      return json(res, 200, { success: true, externalId, status: "sent" });
    }
    return json(res, 404, { error: "not_found" });
  });
}

function authorized(req: http.IncomingMessage) { return req.headers.authorization === `Bearer ${config.apiKey}`; }
function json(res: http.ServerResponse, status: number, value: unknown) { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); }
async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) as Record<string, unknown> : {};
}
