import crypto from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdFor(incoming: string | undefined) {
  const candidate = incoming?.trim();
  return candidate && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : crypto.randomUUID();
}
