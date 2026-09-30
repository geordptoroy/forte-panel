import { describe, expect, it } from "vitest";
import { isAllowedOutboundMediaUrl } from "./media-reference.js";

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
});
