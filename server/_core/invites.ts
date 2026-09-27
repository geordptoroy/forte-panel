import crypto from "node:crypto";

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export function createInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isInviteExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}
