import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? "3010"),
  apiKey: required("WHATSAPP_API_KEY"),
  sessionDir: process.env.WHATSAPP_SESSION_DIR ?? "/app/sessions",
  sessionEncryptionKey: process.env.WHATSAPP_SESSION_ENCRYPTION_KEY?.trim() || "",
  webhookUrl: process.env.WHATSAPP_WEBHOOK_URL?.trim() ?? "",
  webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET?.trim() ?? "",
  webhookOutboxDir:
    process.env.WHATSAPP_WEBHOOK_OUTBOX_DIR?.trim() || "/app/sessions/outbox",
  webhookMaxAttempts: Math.max(
    1,
    Number(process.env.WHATSAPP_WEBHOOK_MAX_ATTEMPTS ?? "8")
  ),
  webhookInitialBackoffMs: Math.max(
    50,
    Number(process.env.WHATSAPP_WEBHOOK_INITIAL_BACKOFF_MS ?? "1000")
  ),
  webhookMaxBackoffMs: Math.max(
    1_000,
    Number(process.env.WHATSAPP_WEBHOOK_MAX_BACKOFF_MS ?? "60000")
  ),
  instanceId: process.env.WHATSAPP_INSTANCE_ID?.trim() || "default",
};

if (config.webhookUrl && !config.webhookSecret)
  throw new Error(
    "WHATSAPP_WEBHOOK_SECRET is required when WHATSAPP_WEBHOOK_URL is configured"
  );
