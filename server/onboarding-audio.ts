import crypto from "node:crypto";

export const ONBOARDING_AUDIO_MAX_BYTES = 16 * 1024 * 1024;
export const ONBOARDING_AUDIO_MAX_DURATION_MS = 120_000;

export const onboardingAudioMimeTypes = [
  "audio/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/ogg",
  "audio/m4a",
  "audio/mp4",
] as const;

export type OnboardingAudioMimeType = (typeof onboardingAudioMimeTypes)[number];

const DATA_URL_PREFIX = /^data:([^;,]+);base64,/i;

export function normalizeOnboardingAudioMimeType(value: string) {
  return value.trim().toLowerCase().split(";", 1)[0] ?? "";
}

export function validateOnboardingAudioMetadata(input: {
  mimeType: string;
  durationMs?: number;
}) {
  const mimeType = normalizeOnboardingAudioMimeType(input.mimeType);
  const errors: string[] = [];
  if (!(onboardingAudioMimeTypes as readonly string[]).includes(mimeType))
    errors.push("mime_type_unsupported");
  if (
    input.durationMs !== undefined &&
    (!Number.isInteger(input.durationMs) ||
      input.durationMs < 1 ||
      input.durationMs > ONBOARDING_AUDIO_MAX_DURATION_MS)
  )
    errors.push("duration_out_of_range");
  return { valid: errors.length === 0, errors, mimeType };
}

export function decodeOnboardingAudioBase64(
  value: string,
  expectedMimeType: string
) {
  const raw = value.trim();
  if (!raw) throw new Error("ONBOARDING_AUDIO_EMPTY");

  const dataUrlMatch = DATA_URL_PREFIX.exec(raw);
  const base64 = dataUrlMatch ? raw.slice(dataUrlMatch[0].length) : raw;
  const embeddedMimeType = dataUrlMatch
    ? normalizeOnboardingAudioMimeType(dataUrlMatch[1] ?? "")
    : null;
  const mimeType = normalizeOnboardingAudioMimeType(expectedMimeType);

  if (embeddedMimeType && embeddedMimeType !== mimeType)
    throw new Error("ONBOARDING_AUDIO_MIME_MISMATCH");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1)
    throw new Error("ONBOARDING_AUDIO_INVALID_BASE64");

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw new Error("ONBOARDING_AUDIO_EMPTY");
  if (buffer.length > ONBOARDING_AUDIO_MAX_BYTES)
    throw new Error("ONBOARDING_AUDIO_TOO_LARGE");
  return buffer;
}

export function onboardingAudioExtension(mimeType: string) {
  const normalized = normalizeOnboardingAudioMimeType(mimeType);
  const extensions: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
  };
  return extensions[normalized] ?? "audio";
}

export function buildOnboardingAudioStorageKey(
  workspaceId: number,
  sessionId: number,
  mimeType: string
) {
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0)
    throw new Error("ONBOARDING_AUDIO_WORKSPACE_INVALID");
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0)
    throw new Error("ONBOARDING_AUDIO_SESSION_INVALID");
  return `workspaces/${workspaceId}/onboarding-audio/${sessionId}/${crypto.randomUUID()}.${onboardingAudioExtension(mimeType)}`;
}

export function sha256ForOnboardingAudio(buffer: Uint8Array) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
