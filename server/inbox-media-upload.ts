import { randomUUID } from "node:crypto";
import { decodeMediaDataUrl } from "./media-storage";
import { storagePut } from "./storage";

export { decodeMediaDataUrl } from "./media-storage";

export const INBOX_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const INBOX_MEDIA_MAX_DATA_URL_CHARS = Math.ceil(INBOX_MEDIA_MAX_BYTES * 4 / 3) + 512;

export type InboxAttachmentType = "image" | "audio" | "video" | "document";

const supportedMimeTypes: Record<InboxAttachmentType, ReadonlySet<string>> = {
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  audio: new Set([
    "audio/ogg",
    "audio/mpeg",
    "audio/mp4",
    "audio/webm",
    "audio/wav",
    "audio/x-wav",
    "audio/aac",
  ]),
  video: new Set(["video/mp4", "video/3gpp", "video/webm", "video/quicktime"]),
  document: new Set([
    "application/pdf",
    "application/octet-stream",
    "text/plain",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ]),
};

export function isSupportedInboxMimeType(
  type: InboxAttachmentType,
  mimeType: string
) {
  return supportedMimeTypes[type].has(mimeType.trim().toLowerCase().split(";")[0]);
}

export function isWorkspaceInboxMediaKey(workspaceId: number, key: string) {
  return (
    key.length <= 512 &&
    key.startsWith(`workspaces/${workspaceId}/outbound/`) &&
    !key.includes("..") &&
    !/[\\\u0000-\u001f]/.test(key)
  );
}

export async function uploadPrivateInboxAttachment(input: {
  workspaceId: number;
  type: InboxAttachmentType;
  fileName: string;
  mimeType: string;
  dataUrl: string;
}) {
  const decoded = decodeMediaDataUrl(input.dataUrl);
  const declaredMimeType = input.mimeType.trim().toLowerCase().split(";")[0];
  const decodedMimeType = decoded?.mimeType.trim().toLowerCase().split(";")[0];
  if (
    !decoded ||
    !declaredMimeType ||
    decodedMimeType !== declaredMimeType ||
    !isSupportedInboxMimeType(input.type, declaredMimeType)
  )
    throw new Error("INBOX_MEDIA_INVALID");
  if (decoded.buffer.length === 0 || decoded.buffer.length > INBOX_MEDIA_MAX_BYTES)
    throw new Error("INBOX_MEDIA_TOO_LARGE");

  const safeFileName = input.fileName
    .replace(/[\\/]/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-120) || "attachment";
  const key = `workspaces/${input.workspaceId}/outbound/${randomUUID()}-${safeFileName}`;
  try {
    const uploaded = await storagePut(key, decoded.buffer, declaredMimeType);
    return {
      storageKey: uploaded.key,
      fileName: safeFileName,
      mimeType: declaredMimeType,
      sizeBytes: decoded.buffer.length,
    };
  } catch {
    // O anexo já foi validado e permanece pequeno o suficiente para atravessar
    // a fila de envio. O storage privado continua sendo preferido, mas não
    // deve impedir o envio transitório em ambientes locais sem Forge/S3.
    return {
      mediaData: input.dataUrl,
      fileName: safeFileName,
      mimeType: declaredMimeType,
      sizeBytes: decoded.buffer.length,
    };
  }
}
