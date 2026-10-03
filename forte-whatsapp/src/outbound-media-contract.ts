export function outboundMediaMimeType(
  metadata: Record<string, unknown>,
  fallback: string
): string;
export function outboundMediaMimeType(
  metadata: Record<string, unknown>,
  fallback?: string
): string | undefined;
export function outboundMediaMimeType(
  metadata: Record<string, unknown>,
  fallback?: string
): string | undefined {
  const canonical = metadata.mediaMimeType;
  if (typeof canonical === "string" && canonical.trim()) return canonical.trim();
  const legacy = metadata.mimetype;
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  return fallback;
}

export function outboundAudioPtt(metadata: Record<string, unknown>) {
  return metadata.ptt === true;
}
