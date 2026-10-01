import { describe, expect, it } from "vitest";
import {
  decodeMediaDataUrl,
  persistInboundMedia,
  persistOutboundMedia,
} from "./media-storage";

describe("private media storage contract", () => {
  it("decodes valid base64 data URLs and rejects malformed values", () => {
    expect(decodeMediaDataUrl("data:image/png;base64,SGk="))?.toMatchObject({
      mimeType: "image/png",
      buffer: Buffer.from("Hi"),
    });
    expect(decodeMediaDataUrl("https://example.test/file.png")).toBeNull();
    expect(decodeMediaDataUrl("data:image/png,plain-text")).toBeNull();
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

  it("enforces MIME by message type and the outbound size boundary on the server", async () => {
    const previousStorage = process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED;
    const previousMax = process.env.FORTE_MEDIA_MAX_BYTES;
    delete process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED;
    process.env.FORTE_MEDIA_MAX_BYTES = "1";
    await expect(
      persistInboundMedia(
        1,
        "event-2",
        { mediaData: "data:image/png;base64,SGk=" },
        "document"
      )
    ).rejects.toThrow("não é permitido");
    await expect(
      persistOutboundMedia(
        1,
        "message-1",
        { mediaData: "data:image/png;base64,SGk=" },
        "image"
      )
    ).rejects.toThrow("excede o limite");
    if (previousStorage === undefined)
      delete process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED;
    else process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED = previousStorage;
    if (previousMax === undefined) delete process.env.FORTE_MEDIA_MAX_BYTES;
    else process.env.FORTE_MEDIA_MAX_BYTES = previousMax;
  });
});
