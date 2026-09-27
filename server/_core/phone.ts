const JID_SUFFIXES = new Set(["s.whatsapp.net", "lid", "g.us"]);

function cleanJidLocal(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._:-]/g, "");
}

/** Canonical key used for workspace contact deduplication. */
export function normalizeContactPhone(input: string) {
  const raw = input.trim().toLowerCase();
  if (raw.startsWith("lid:"))
    return `lid:${cleanJidLocal(raw.slice("lid:".length))}`;
  if (raw.startsWith("group:"))
    return `group:${cleanJidLocal(raw.slice("group:".length))}`;
  const at = raw.indexOf("@");
  if (at > 0) {
    const local = cleanJidLocal(raw.slice(0, at));
    const suffix = raw.slice(at + 1);
    if (!local) return "";
    if (suffix === "lid") return `lid:${local}`;
    if (suffix === "g.us") return `group:${local}`;
    if (suffix === "s.whatsapp.net") return local.replace(/\D/g, "");
  }
  return raw.replace(/\D/g, "");
}

/** Preserve the routing identity used by WhatsApp, without punctuation noise. */
export function normalizeWhatsappJid(input: string | undefined) {
  if (!input?.trim()) return undefined;
  const raw = input.trim().toLowerCase();
  const at = raw.indexOf("@");
  if (at > 0) {
    const local = cleanJidLocal(raw.slice(0, at));
    const suffix = raw.slice(at + 1);
    if (local && JID_SUFFIXES.has(suffix)) return `${local}@${suffix}`;
  }
  const digits = raw.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : undefined;
}

export function isValidContactPhone(input: string) {
  const normalized = normalizeContactPhone(input);
  return normalized.length >= 8 && normalized.length <= 32;
}
