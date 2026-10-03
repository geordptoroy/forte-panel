import { describe, expect, it } from "vitest";
import {
  outboundAudioPtt,
  outboundMediaMimeType,
} from "./outbound-media-contract.js";

describe("outbound MIME/PTT contract", () => {
  it("prefers the canonical mediaMimeType and keeps mimetype as compatibility fallback", () => {
    expect(
      outboundMediaMimeType({
        mediaMimeType: " audio/webm;codecs=opus ",
        mimetype: "audio/ogg",
      })
    ).toBe("audio/webm;codecs=opus");
    expect(outboundMediaMimeType({ mimetype: "image/png" })).toBe("image/png");
    expect(outboundMediaMimeType({}, "application/octet-stream")).toBe(
      "application/octet-stream"
    );
  });

  it("requires explicit PTT instead of treating every audio attachment as a voice note", () => {
    expect(outboundAudioPtt({ ptt: true })).toBe(true);
    expect(outboundAudioPtt({ ptt: false })).toBe(false);
    expect(outboundAudioPtt({})).toBe(false);
  });
});
