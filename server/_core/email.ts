import { ENV } from "./env";

export type EmailProvider = "none" | "smtp" | "resend" | "postmark" | "sendgrid";

export type PasswordResetEmailPayload = {
  to: string;
  name: string | null;
  token: string;
  expiresAt: Date;
};

export type PreparedPasswordResetEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  resetUrl: string;
  expiresAt: Date;
};

export function getEmailDeliveryConfig() {
  const configuredProvider = ENV.emailProvider || "none";
  const provider = (["none", "smtp", "resend", "postmark", "sendgrid"] as const).includes(
    configuredProvider as EmailProvider
  )
    ? (configuredProvider as EmailProvider)
    : "none";
  const providerReady = provider === "smtp"
    ? Boolean(ENV.smtpHost && ENV.smtpPort && ENV.smtpUser && ENV.smtpPassword)
    : provider === "none"
      ? false
      : Boolean(ENV.emailFrom);
  return {
    enabled: ENV.emailDeliveryEnabled,
    provider,
    from: ENV.emailFrom,
    appUrl: ENV.publicAppUrl.replace(/\/$/, ""),
    providerReady,
    ready: ENV.emailDeliveryEnabled && provider !== "none" && providerReady,
  } as const;
}

export function buildPasswordResetUrl(token: string, appUrl = getEmailDeliveryConfig().appUrl) {
  return `${appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

export function preparePasswordResetEmail(
  payload: PasswordResetEmailPayload,
  config = getEmailDeliveryConfig()
): PreparedPasswordResetEmail {
  const resetUrl = buildPasswordResetUrl(payload.token, config.appUrl);
  return {
    to: payload.to,
    from: config.from,
    subject: "Redefina sua senha do Forte Panel",
    resetUrl,
    expiresAt: payload.expiresAt,
    text: [
      `Olá${payload.name ? `, ${payload.name}` : ""}.`,
      "Recebemos um pedido para redefinir sua senha do Forte Panel.",
      `Use este link uma única vez: ${resetUrl}`,
      "O link expira em 30 minutos. Se você não fez este pedido, ignore esta mensagem.",
    ].join("\n\n"),
  };
}

export function describeEmailDelivery() {
  const config = getEmailDeliveryConfig();
  if (!config.enabled) return "disabled" as const;
  if (!config.ready) return "not_configured" as const;
  return "ready" as const;
}
