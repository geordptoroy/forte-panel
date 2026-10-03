import type { Express } from "express";
import { getWorkspaceMembershipContext } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

function isSafeStorageKey(key: string) {
  if (
    key.length > 512 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(key) ||
    /%(?:2e|2f|5c)/i.test(key)
  )
    return false;
  const segments = key.split("/");
  return segments.every(
    segment => segment.length > 0 && segment !== "." && segment !== ".."
  );
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const requestId = String(res.locals?.requestId ?? "unknown");
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).send("Authentication required");
      return;
    }

    if (!isSafeStorageKey(key)) {
      res.status(400).send("Invalid storage key");
      return;
    }

    let membership;
    try {
      membership = await getWorkspaceMembershipContext(user.id);
    } catch (err) {
      console.error("[StorageProxy] failed to resolve workspace membership", {
        requestId,
        error: err instanceof Error ? err.name : "unknown_error",
      });
      res.status(503).send("Storage authorization unavailable");
      return;
    }
    if (!membership) {
      res.status(404).send("Storage object not found");
      return;
    }
    const workspacePrefix = `workspaces/${membership.workspaceId}/`;
    if (!key.startsWith(workspacePrefix) || key.length === workspacePrefix.length) {
      res.status(404).send("Storage object not found");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        await forgeResp.text().catch(() => "");
        console.error("[StorageProxy] forge error", {
          requestId,
          status: forgeResp.status,
        });
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed", {
        requestId,
        error: err instanceof Error ? err.name : "unknown_error",
      });
      res.status(502).send("Storage proxy error");
    }
  });
}
