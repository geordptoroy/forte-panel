import { storageGetSignedUrl, storagePut } from "./storage";
import {
  INBOX_MEDIA_MAX_BYTES,
  INBOX_MEDIA_MAX_DATA_URL_CHARS,
} from "./media-limits";

type MediaMetadata = Record<string, unknown>;

const DATA_URL_PATTERN = /^data:([^;,]+)(?:;[^;,]*)*;base64,([A-Za-z0-9+/=]+)$/i;

export function decodeMediaDataUrl(value: string) {
  if (value.length > INBOX_MEDIA_MAX_DATA_URL_CHARS) return null;
  const match = DATA_URL_PATTERN.exec(value);
  if (!match) return null;
  const encoded = match[2];
  if (encoded.length > INBOX_MEDIA_MAX_DATA_URL_CHARS) return null;
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length < 1 || buffer.length > INBOX_MEDIA_MAX_BYTES) return null;
  return {
    mimeType: match[1],
    buffer,
  };
}

function extensionForMime(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "audio/ogg") return "ogg";
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "application/pdf") return "pdf";
  return "bin";
}

export async function persistInboundMedia(
  workspaceId: number,
  eventId: string,
  metadata: MediaMetadata | undefined
): Promise<MediaMetadata | undefined> {
  if (!metadata) return metadata;
  const mediaData = metadata.mediaData;
  if (typeof mediaData !== "string") return metadata;
  const decoded = decodeMediaDataUrl(mediaData);
  if (!decoded)
    throw new Error("Mídia inbound inválida ou excede o limite de 8 MiB");
  if (process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED !== "true") return metadata;
  const configuredMaxBytes = Number(process.env.FORTE_MEDIA_MAX_BYTES);
  const maxBytes = Number.isFinite(configuredMaxBytes)
    ? Math.max(1, Math.min(Math.floor(configuredMaxBytes), INBOX_MEDIA_MAX_BYTES))
    : INBOX_MEDIA_MAX_BYTES;
  if (decoded.buffer.length > maxBytes)
    throw new Error(`Mídia inbound excede o limite de ${maxBytes} bytes`);
  const fileName =
    typeof metadata.fileName === "string"
      ? metadata.fileName
      : `media.${extensionForMime(decoded.mimeType)}`;
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const key = `workspaces/${workspaceId}/whatsapp/${eventId}-${safeFileName}`;
  const uploaded = await storagePut(key, decoded.buffer, decoded.mimeType);
  return {
    ...metadata,
    mediaStorageKey: uploaded.key,
    mediaMimeType: decoded.mimeType,
    mediaSizeBytes: decoded.buffer.length,
    mediaUrl: uploaded.url,
    mediaData: undefined,
  };
}

export async function resolvePrivateMediaUrl(
  metadata: MediaMetadata | undefined
) {
  const key = metadata?.mediaStorageKey;
  if (typeof key !== "string" || !key) return undefined;
  return storageGetSignedUrl(key);
}
