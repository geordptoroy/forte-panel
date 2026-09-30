import { describe, expect, it } from "vitest";
import { securityHeadersForRequest } from "./http-security";

function request(protocol = "http", secure = false, forwardedProto?: string) {
  return {
    protocol,
    secure,
    get(name: string) {
      return name === "x-forwarded-proto" ? forwardedProto : undefined;
    },
  };
}

describe("HTTP security headers", () => {
  it("sets browser hardening headers for every request", () => {
    expect(securityHeadersForRequest(request())).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
  });

  it("only emits HSTS when the resolved request is HTTPS", () => {
    expect(securityHeadersForRequest(request())).not.toHaveProperty(
      "Strict-Transport-Security"
    );
    expect(securityHeadersForRequest(request("http", false, "https"))).toMatchObject({
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    });
  });
});
