import { storageGetSignedUrl, storagePut } from "./storage";

type MediaMetadata = Record<string, unknown>;

const DATA_URL_PATTERN = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/;

export function decodeMediaDataUrl(value: string) {
  const match = DATA_URL_PATTERN.exec(value);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
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
  if (!metadata || process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED !== "true")
    return metadata;
  const mediaData = metadata.mediaData;
  if (typeof mediaData !== "string") return metadata;
  const decoded = decodeMediaDataUrl(mediaData);
  if (!decoded)
    throw new Error("Mídia inbound não está em data URL base64 válida");
  const maxBytes = Number(
    process.env.FORTE_MEDIA_MAX_BYTES ?? 15 * 1024 * 1024
  );
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
