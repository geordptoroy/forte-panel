import { describe, expect, it } from "vitest";
import { decodeMediaDataUrl, persistInboundMedia } from "./media-storage";
import { INBOX_MEDIA_MAX_BYTES } from "./media-limits";

describe("private media storage contract", () => {
  it("decodes valid base64 data URLs and rejects malformed values", () => {
    expect(decodeMediaDataUrl("data:image/png;base64,SGk="))?.toMatchObject({
      mimeType: "image/png",
      buffer: Buffer.from("Hi"),
    });
    expect(decodeMediaDataUrl("https://example.test/file.png")).toBeNull();
    expect(decodeMediaDataUrl("data:image/png,plain-text")).toBeNull();
    expect(
      decodeMediaDataUrl("data:audio/webm;codecs=opus;base64,SGk=")
    )?.toMatchObject({ mimeType: "audio/webm", buffer: Buffer.from("Hi") });
  });

  it("rejects a data URL whose decoded media exceeds 8 MiB", () => {
    const oversized = `data:image/png;base64,${Buffer.alloc(
      INBOX_MEDIA_MAX_BYTES + 1
    ).toString("base64")}`;
    expect(decodeMediaDataUrl(oversized)).toBeNull();
  });

  it("keeps metadata unchanged when private storage is disabled", async () => {
    const previous = process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED;
    delete process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED;
    const metadata = {
      mediaData: "data:image/png;base64,SGk=",
      provider: "baileys",
    };
    await expect(persistInboundMedia(1, "event-1", metadata)).resolves.toBe(
      metadata
    );
    if (previous === undefined)
      delete process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED;
    else process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED = previous;
  });
});
