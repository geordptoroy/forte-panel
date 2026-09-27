CREATE TABLE IF NOT EXISTS "passwordResetTokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "tokenHash" varchar(64) NOT NULL UNIQUE,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "revokedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_idx"
  ON "passwordResetTokens" ("userId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expiry_idx"
  ON "passwordResetTokens" ("expiresAt", "usedAt", "revokedAt");
