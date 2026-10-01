import { storageGetSignedUrl, storagePut } from "./storage";

type MediaMetadata = Record<string, unknown>;
export type MediaMessageType = "image" | "audio" | "video" | "document";

const DATA_URL_PATTERN = /^data:([^,\s]+);base64,([A-Za-z0-9+/]+={0,2})$/;
const MIME_BY_TYPE: Record<MediaMessageType, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  audio: ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/webm", "audio/wav"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ],
};

export function decodeMediaDataUrl(value: string) {
  const match = DATA_URL_PATTERN.exec(value);
  if (!match) return null;
  const encoded = match[2];
  if (encoded.length % 4 === 1) return null;
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) return null;
  return { mimeType: match[1].split(";", 1)[0].toLowerCase(), buffer };
}

function extensionForMime(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "audio/ogg") return "ogg";
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "audio/mp4") return "m4a";
  if (normalized === "audio/webm") return "webm";
  if (normalized === "audio/wav") return "wav";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "video/webm") return "webm";
  if (normalized === "video/quicktime") return "mov";
  if (normalized === "application/pdf") return "pdf";
  if (normalized.includes("wordprocessingml")) return "docx";
  if (normalized.includes("spreadsheetml")) return "xlsx";
  if (normalized === "application/msword") return "doc";
  if (normalized === "application/vnd.ms-excel") return "xls";
  if (normalized === "text/csv") return "csv";
  if (normalized === "text/plain") return "txt";
  return "bin";
}

function assertMediaBoundary(
  decoded: { mimeType: string; buffer: Buffer },
  messageType: MediaMessageType,
  maxBytes: number
) {
  if (!MIME_BY_TYPE[messageType].includes(decoded.mimeType))
    throw new Error(
      `MIME ${decoded.mimeType} não é permitido para mensagem ${messageType}`
    );
  if (decoded.buffer.length > maxBytes)
    throw new Error(`Mídia ${messageType} excede o limite de ${maxBytes} bytes`);
}

function inferMediaMessageType(mimeType: string): MediaMessageType {
  const match = (Object.keys(MIME_BY_TYPE) as MediaMessageType[]).find(type =>
    MIME_BY_TYPE[type].includes(mimeType)
  );
  if (!match) throw new Error(`MIME ${mimeType} não é permitido para mídia WhatsApp`);
  return match;
}

async function persistMediaData(
  workspaceId: number,
  keyPrefix: "whatsapp" | "whatsapp-outbound",
  identity: string,
  metadata: MediaMetadata,
  messageType: MediaMessageType,
  defaultMaxBytes: number
): Promise<MediaMetadata> {
  const mediaData = metadata.mediaData;
  if (typeof mediaData !== "string") return metadata;
  const decoded = decodeMediaDataUrl(mediaData);
  if (!decoded) throw new Error("Mídia não está em data URL base64 válida");
  const maxBytes = Number(
    process.env.FORTE_MEDIA_MAX_BYTES ?? defaultMaxBytes
  );
  assertMediaBoundary(decoded, messageType, maxBytes);
  const fileName =
    typeof metadata.fileName === "string" && metadata.fileName.trim()
      ? metadata.fileName
      : `media.${extensionForMime(decoded.mimeType)}`;
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const key = `workspaces/${workspaceId}/${keyPrefix}/${identity}-${safeFileName}`;
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

export async function persistInboundMedia(
  workspaceId: number,
  eventId: string,
  metadata: MediaMetadata | undefined,
  messageType?: MediaMessageType
): Promise<MediaMetadata | undefined> {
  if (!metadata || typeof metadata.mediaData !== "string") return metadata;
  const decoded = decodeMediaDataUrl(metadata.mediaData);
  if (!decoded) throw new Error("Mídia não está em data URL base64 válida");
  const maxBytes = Number(
    process.env.FORTE_MEDIA_MAX_BYTES ?? 15 * 1024 * 1024
  );
  const effectiveMessageType =
    messageType ?? inferMediaMessageType(decoded.mimeType);
  assertMediaBoundary(decoded, effectiveMessageType, maxBytes);
  if (process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED !== "true") return metadata;
  return persistMediaData(
    workspaceId,
    "whatsapp",
    eventId,
    metadata,
    effectiveMessageType,
    15 * 1024 * 1024
  );
}

export async function persistOutboundMedia(
  workspaceId: number,
  messageId: string,
  metadata: MediaMetadata | undefined,
  messageType: MediaMessageType
): Promise<MediaMetadata | undefined> {
  if (!metadata || typeof metadata.mediaData !== "string") return metadata;
  const decoded = decodeMediaDataUrl(metadata.mediaData);
  if (!decoded) throw new Error("Mídia não está em data URL base64 válida");
  const maxBytes = Number(
    process.env.FORTE_MEDIA_MAX_BYTES ?? 8 * 1024 * 1024
  );
  assertMediaBoundary(decoded, messageType, maxBytes);
  if (process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED !== "true") return metadata;
  return persistMediaData(
    workspaceId,
    "whatsapp-outbound",
    messageId,
    metadata,
    messageType,
    8 * 1024 * 1024
  );
}

export async function resolvePrivateMediaUrl(
  metadata: MediaMetadata | undefined
) {
  const key = metadata?.mediaStorageKey;
  if (typeof key !== "string" || !key) return undefined;
  return storageGetSignedUrl(key);
}
