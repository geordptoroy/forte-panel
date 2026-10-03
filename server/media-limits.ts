export const INBOX_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const INBOX_MEDIA_MAX_DATA_URL_CHARS =
  Math.ceil((INBOX_MEDIA_MAX_BYTES * 4) / 3) + 512;

// 8 MiB decoded media needs roughly 11.2 MiB as base64; the remaining
// envelope overhead is intentionally bounded by this route-specific limit.
export const BAILEYS_WEBHOOK_MAX_BODY_BYTES = 12 * 1024 * 1024;
