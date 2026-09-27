import type { Request } from "express";
import { TRPCError } from "@trpc/server";

type LoginBucket = {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_BLOCK_MS = 30 * 60 * 1000;
const SIGNUP_MAX_ATTEMPTS = 3;
const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_BLOCK_MS = 30 * 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;
const loginBuckets = new Map<string, LoginBucket>();
const signupBuckets = new Map<string, LoginBucket>();
const passwordResetBuckets = new Map<string, LoginBucket>();

function getForwardedValue(value: string | string[] | undefined) {
  if (!value) return undefined;
  return (Array.isArray(value) ? value[0] : value).split(",")[0]?.trim();
}

export function getRequestAddress(req: Request) {
  // Express does not trust forwarded headers by default. Use the resolved
  // address so a client cannot spoof X-Forwarded-For to evade the limiter.
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function getRequestOrigin(req: Request) {
  const forwardedProto = getForwardedValue(req.headers["x-forwarded-proto"]);
  const forwardedHost = getForwardedValue(req.headers["x-forwarded-host"]);
  const protocol = forwardedProto ?? req.protocol;
  const host = forwardedHost ?? req.get("host");
  return host ? `${protocol}://${host}` : null;
}

/**
 * Browser mutations must come from the same origin as the request host. Requests
 * without Origin are kept compatible with CLI/webhook callers; a browser
 * explicitly identifying itself as cross-site is still rejected.
 */
export function assertSameOrigin(req: Request | undefined) {
  // createCaller() and internal server jobs do not have an HTTP request. The
  // actual Express adapter always supplies one, so only HTTP traffic is gated.
  if (!req || !req.method) return;
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) return;

  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite === "cross-site" || origin === "null") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Origem da requisição não permitida",
    });
  }

  const expectedOrigin = getRequestOrigin(req);
  if (origin && expectedOrigin && origin !== expectedOrigin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Origem da requisição não permitida",
    });
  }
}

function bucketKeys(req: Request, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return [`ip:${getRequestAddress(req)}`, `email:${normalizedEmail}`];
}

function pruneBucket(key: string, now: number) {
  const bucket = loginBuckets.get(key);
  if (!bucket) return undefined;
  if (
    now - bucket.firstFailureAt > LOGIN_WINDOW_MS &&
    bucket.blockedUntil <= now
  ) {
    loginBuckets.delete(key);
    return undefined;
  }
  return bucket;
}

export function assertLoginAllowed(req: Request, email: string, now = Date.now()) {
  for (const key of bucketKeys(req, email)) {
    const bucket = pruneBucket(key, now);
    if (bucket?.blockedUntil && bucket.blockedUntil > now) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Muitas tentativas de login. Tente novamente mais tarde.",
      });
    }
  }
}

export function recordLoginFailure(
  req: Request,
  email: string,
  now = Date.now()
) {
  for (const key of bucketKeys(req, email)) {
    const existing = pruneBucket(key, now);
    const bucket: LoginBucket = existing ?? {
      failures: 0,
      firstFailureAt: now,
      blockedUntil: 0,
    };
    bucket.failures += 1;
    if (bucket.failures >= LOGIN_MAX_FAILURES) {
      bucket.blockedUntil = now + LOGIN_BLOCK_MS;
    }
    loginBuckets.set(key, bucket);
  }
}

export function recordLoginSuccess(req: Request, email: string) {
  for (const key of bucketKeys(req, email)) loginBuckets.delete(key);
}

function pruneSignupBucket(key: string, now: number) {
  const bucket = signupBuckets.get(key);
  if (!bucket) return undefined;
  if (
    now - bucket.firstFailureAt > SIGNUP_WINDOW_MS &&
    bucket.blockedUntil <= now
  ) {
    signupBuckets.delete(key);
    return undefined;
  }
  return bucket;
}

export function assertSignupAllowed(
  req: Request,
  email: string,
  now = Date.now()
) {
  for (const key of bucketKeys(req, email)) {
    const bucket = pruneSignupBucket(key, now);
    if (bucket?.blockedUntil && bucket.blockedUntil > now)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Muitas tentativas de cadastro. Tente novamente mais tarde.",
      });
  }
}

export function recordSignupAttempt(
  req: Request,
  email: string,
  now = Date.now()
) {
  for (const key of bucketKeys(req, email)) {
    const existing = pruneSignupBucket(key, now);
    const bucket: LoginBucket = existing ?? {
      failures: 0,
      firstFailureAt: now,
      blockedUntil: 0,
    };
    bucket.failures += 1;
    if (bucket.failures >= SIGNUP_MAX_ATTEMPTS)
      bucket.blockedUntil = now + SIGNUP_BLOCK_MS;
    signupBuckets.set(key, bucket);
  }
}

function prunePasswordResetBucket(key: string, now: number) {
  const bucket = passwordResetBuckets.get(key);
  if (!bucket) return undefined;
  if (
    now - bucket.firstFailureAt > PASSWORD_RESET_WINDOW_MS &&
    bucket.blockedUntil <= now
  ) {
    passwordResetBuckets.delete(key);
    return undefined;
  }
  return bucket;
}

export function assertPasswordResetAllowed(
  req: Request,
  email: string,
  now = Date.now()
) {
  for (const key of bucketKeys(req, email)) {
    const bucket = prunePasswordResetBucket(key, now);
    if (bucket?.blockedUntil && bucket.blockedUntil > now)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Muitas solicitações. Tente novamente mais tarde.",
      });
  }
}

export function recordPasswordResetAttempt(
  req: Request,
  email: string,
  now = Date.now()
) {
  for (const key of bucketKeys(req, email)) {
    const existing = prunePasswordResetBucket(key, now);
    const bucket: LoginBucket = existing ?? {
      failures: 0,
      firstFailureAt: now,
      blockedUntil: 0,
    };
    bucket.failures += 1;
    if (bucket.failures >= PASSWORD_RESET_MAX_ATTEMPTS)
      bucket.blockedUntil = now + PASSWORD_RESET_BLOCK_MS;
    passwordResetBuckets.set(key, bucket);
  }
}

export function resetLoginRateLimitForTests() {
  loginBuckets.clear();
  signupBuckets.clear();
  passwordResetBuckets.clear();
}

export const loginRateLimitConfig = {
  windowMs: LOGIN_WINDOW_MS,
  blockMs: LOGIN_BLOCK_MS,
  maxFailures: LOGIN_MAX_FAILURES,
};

export const signupRateLimitConfig = {
  windowMs: SIGNUP_WINDOW_MS,
  blockMs: SIGNUP_BLOCK_MS,
  maxAttempts: SIGNUP_MAX_ATTEMPTS,
};

export const passwordResetRateLimitConfig = {
  windowMs: PASSWORD_RESET_WINDOW_MS,
  blockMs: PASSWORD_RESET_BLOCK_MS,
  maxAttempts: PASSWORD_RESET_MAX_ATTEMPTS,
};
