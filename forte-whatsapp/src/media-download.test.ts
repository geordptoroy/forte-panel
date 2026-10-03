import { describe, expect, it } from "vitest";
import { readMediaStreamWithLimit } from "./media-download.js";

async function* chunks(values: string[]) {
  for (const value of values) yield Buffer.from(value);
}

describe("bounded inbound media download", () => {
  it("joins chunks that remain within the byte limit", async () => {
    await expect(
      readMediaStreamWithLimit(chunks(["forte", "-", "panel"]), 32)
    ).resolves.toEqual(Buffer.from("forte-panel"));
  });

  it("rejects a stream as soon as it crosses the byte limit", async () => {
    await expect(
      readMediaStreamWithLimit(chunks(["1234", "56"]), 5)
    ).rejects.toThrow("inbound_media_too_large");
  });
});
