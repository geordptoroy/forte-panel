import type { Transform } from "node:stream";

export const INBOUND_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export async function readMediaStreamWithLimit(
  stream: AsyncIterable<Uint8Array> & Partial<Pick<Transform, "destroy">>,
  maxBytes = INBOUND_MEDIA_MAX_BYTES
) {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        stream.destroy?.();
        throw new Error("inbound_media_too_large");
      }
      chunks.push(buffer);
    }
  } catch (error) {
    stream.destroy?.();
    throw error;
  }
  return Buffer.concat(chunks, total);
}
