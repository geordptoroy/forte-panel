import { isIP } from "node:net";

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isInteger(value) || value < 0 || value > 255))
    return false;
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && (parts[1] === 168 || parts[1] === 0 || parts[1] === 2)) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51)) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
    parts[0] >= 224
  );
}

export function isAllowedOutboundMediaUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    )
      return false;
    const ipVersion = isIP(hostname);
    if (ipVersion === 4 && isPrivateIpv4(hostname)) return false;
    if (
      ipVersion === 6 &&
      (hostname === "::" ||
        hostname === "::1" ||
        hostname.startsWith("::ffff:") ||
        hostname.startsWith("fc") ||
        hostname.startsWith("fd") ||
        hostname.startsWith("fe80:"))
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

const DATA_URL_PATTERN = /^data:([^;,]+)(?:;[^;,]*)*;base64,([A-Za-z0-9+/=]+)$/i;

export function decodeAllowedOutboundMediaData(value: string) {
  const match = DATA_URL_PATTERN.exec(value);
  if (!match) return undefined;
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length < 1 || buffer.length > 8 * 1024 * 1024) return undefined;
  return { mimeType: match[1].toLowerCase(), buffer };
}

export function isAllowedOutboundMediaReference(value: string) {
  return isAllowedOutboundMediaUrl(value) || Boolean(decodeAllowedOutboundMediaData(value));
}
