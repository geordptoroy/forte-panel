import { describe, expect, it } from "vitest";
import {
  decodeAllowedOutboundMediaData,
  isAllowedOutboundMediaReference,
  isAllowedOutboundMediaUrl,
} from "./media-reference.js";

describe("outbound private media URL guard", () => {
  it("allows signed HTTPS URLs on public hosts", () => {
    expect(isAllowedOutboundMediaUrl("https://media.example.com/file?signature=abc")).toBe(true);
  });

  it("rejects data URLs, insecure URLs, local addresses, and embedded credentials", () => {
    for (const url of [
      "data:image/png;base64,SGk=",
      "http://media.example.com/file",
      "https://localhost/file",
      "https://127.0.0.1/file",
      "https://10.1.2.3/file",
      "https://172.20.0.1/file",
      "https://192.168.1.1/file",
      "https://100.64.0.1/file",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/file",
      "https://[::ffff:127.0.0.1]/file",
      "https://localhost./file",
      "https://user:pass@media.example.com/file",
      "https://bucket.internal/file",
    ])
      expect(isAllowedOutboundMediaUrl(url), url).toBe(false);
  });

  it("allows a small validated base64 data URL and decodes its bytes", () => {
    const value = "data:image/png;base64,SGk=";
    expect(isAllowedOutboundMediaReference(value)).toBe(true);
    expect(decodeAllowedOutboundMediaData(value)).toMatchObject({
      mimeType: "image/png",
      buffer: Buffer.from("Hi"),
    });
  });

  it("rejects malformed or oversized base64 data URLs", () => {
    expect(isAllowedOutboundMediaReference("data:image/png;base64,not-base64!")).toBe(false);
    const oversized = `data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64")}`;
    expect(isAllowedOutboundMediaReference(oversized)).toBe(false);
  });
});
