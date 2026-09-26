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
  webhookUrl: process.env.WHATSAPP_WEBHOOK_URL?.trim() ?? "",
  webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET?.trim() ?? "",
  instanceId: process.env.WHATSAPP_INSTANCE_ID?.trim() || "default",
};
