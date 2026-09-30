import type { Request } from "express";

export function securityHeadersForRequest(req: Pick<Request, "protocol" | "secure" | "get">) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const isHttps = req.secure || req.protocol === "https" || forwardedProto === "https";
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...(isHttps
      ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
      : {}),
  };
}
