import crypto from "node:crypto";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { TRPCError } from "@trpc/server";
import {
  SecurityBackendUnavailableError,
  securityFailClosed,
} from "./_core/security-mode";

type RateLimitKind = "login" | "signup" | "password_reset";
type LoginStage = { failures: number; blockMs: number };

const loginStages: LoginStage[] = [
  { failures: positiveEnvInt("FORTE_LOGIN_RATE_LIMIT_STAGE_1_FAILURES", 5), blockMs: positiveEnvInt("FORTE_LOGIN_RATE_LIMIT_STAGE_1_BLOCK_MS", 60_000) },
  { failures: positiveEnvInt("FORTE_LOGIN_RATE_LIMIT_STAGE_2_FAILURES", 10), blockMs: positiveEnvInt("FORTE_LOGIN_RATE_LIMIT_STAGE_2_BLOCK_MS", 180_000) },
  { failures: positiveEnvInt("FORTE_LOGIN_RATE_LIMIT_STAGE_3_FAILURES", 15), blockMs: positiveEnvInt("FORTE_LOGIN_RATE_LIMIT_STAGE_3_BLOCK_MS", 900_000) },
].sort((a, b) => a.failures - b.failures);
const loginWindowMs = positiveEnvInt("FORTE_LOGIN_RATE_LIMIT_WINDOW_MS", 900_000);
const signupWindowMs = 900_000;
const signupBlockMs = 1_800_000;
const passwordResetWindowMs = 900_000;
const passwordResetBlockMs = 1_800_000;

function positiveEnvInt(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function addressOf(req: Request) {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function scopeKeys(req: Request, email: string) {
  return [`ip:${addressOf(req)}`, `email:${email.trim().toLowerCase()}`];
}

function scopeHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function messageFor(kind: RateLimitKind) {
  if (kind === "login") return "Muitas tentativas de login. Tente novamente mais tarde.";
  if (kind === "signup") return "Muitas tentativas de cadastro. Tente novamente mais tarde.";
  return "Muitas solicitações. Tente novamente mais tarde.";
}

function blockMsFor(kind: RateLimitKind, failures: number) {
  if (kind === "login") {
    let blockMs = 0;
    for (const stage of loginStages) if (failures >= stage.failures) blockMs = stage.blockMs;
    return blockMs;
  }
  if (kind === "signup") return failures >= 3 ? signupBlockMs : 0;
  return failures >= 5 ? passwordResetBlockMs : 0;
}

function windowMsFor(kind: RateLimitKind) {
  return kind === "login" ? loginWindowMs : kind === "signup" ? signupWindowMs : passwordResetWindowMs;
}

async function withDistributedBucket(
  kind: RateLimitKind,
  req: Request,
  email: string,
  now: number,
  mode: "check" | "failure" | "clear"
) {
  const db = await getDb();
  if (!db) {
    if (securityFailClosed()) throw new SecurityBackendUnavailableError();
    return false;
  }
  await db.transaction(async tx => {
    for (const rawKey of scopeKeys(req, email)) {
      const bucketType = kind;
      const scopeKey = scopeHash(rawKey);
      await tx.execute(sql`
        INSERT INTO "securityRateLimitBuckets" ("bucketType", "scopeKey", "firstFailureAt", "updatedAt")
        VALUES (${bucketType}, ${scopeKey}, ${new Date(now)}, ${new Date(now)})
        ON CONFLICT ("bucketType", "scopeKey") DO NOTHING
      `);
      if (mode === "clear") {
        await tx.execute(sql`
          DELETE FROM "securityRateLimitBuckets"
          WHERE "bucketType" = ${bucketType} AND "scopeKey" = ${scopeKey}
        `);
        continue;
      }
      const result = await tx.execute(sql`
        SELECT "failures", "firstFailureAt", "blockedUntil"
        FROM "securityRateLimitBuckets"
        WHERE "bucketType" = ${bucketType} AND "scopeKey" = ${scopeKey}
        FOR UPDATE
      `);
      const row = result.rows[0] as { failures: number; firstFailureAt: Date; blockedUntil: Date | null } | undefined;
      if (!row) continue;
      const firstFailureAt = new Date(row.firstFailureAt).getTime();
      const blockedUntil = row.blockedUntil ? new Date(row.blockedUntil).getTime() : 0;
      if (blockedUntil > now && mode === "check") {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: messageFor(kind) });
      }
      if (now - firstFailureAt > windowMsFor(kind) && blockedUntil <= now) {
        await tx.execute(sql`
          UPDATE "securityRateLimitBuckets"
          SET "failures" = 0, "firstFailureAt" = ${new Date(now)}, "blockedUntil" = NULL, "updatedAt" = ${new Date(now)}
          WHERE "bucketType" = ${bucketType} AND "scopeKey" = ${scopeKey}
        `);
        if (mode === "check") continue;
        row.failures = 0;
      }
      if (mode === "failure") {
        const failures = Number(row.failures) + 1;
        const blockMs = blockMsFor(kind, failures);
        await tx.execute(sql`
          UPDATE "securityRateLimitBuckets"
          SET "failures" = ${failures},
              "blockedUntil" = ${blockMs > 0 ? new Date(now + blockMs) : null},
              "updatedAt" = ${new Date(now)}
          WHERE "bucketType" = ${bucketType} AND "scopeKey" = ${scopeKey}
        `);
      }
    }
  });
  return true;
}

export async function assertLoginAllowedDistributed(req: Request, email: string, now = Date.now()) {
  return withDistributedBucket("login", req, email, now, "check");
}

export async function recordLoginFailureDistributed(req: Request, email: string, now = Date.now()) {
  return withDistributedBucket("login", req, email, now, "failure");
}

export async function clearLoginDistributed(req: Request, email: string) {
  return withDistributedBucket("login", req, email, Date.now(), "clear");
}

export async function assertSignupAllowedDistributed(req: Request, email: string, now = Date.now()) {
  return withDistributedBucket("signup", req, email, now, "check");
}

export async function recordSignupAttemptDistributed(req: Request, email: string, now = Date.now()) {
  return withDistributedBucket("signup", req, email, now, "failure");
}

export async function assertPasswordResetAllowedDistributed(req: Request, email: string, now = Date.now()) {
  return withDistributedBucket("password_reset", req, email, now, "check");
}

export async function recordPasswordResetAttemptDistributed(req: Request, email: string, now = Date.now()) {
  return withDistributedBucket("password_reset", req, email, now, "failure");
}
