import { ENV } from "./env";

export type EmailProvider = "none" | "smtp" | "resend" | "postmark" | "sendgrid";
export type EmailDeliveryStatus = "sent" | "not_configured";

export type PasswordResetEmailPayload = {
  to: string;
  name: string | null;
  token: string;
  expiresAt: Date;
};

export type InviteEmailPayload = {
  to: string;
  name: string | null;
  token: string;
  expiresAt: Date;
  workspaceName: string;
  role: string;
};

export type PreparedEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
};

export type PreparedPasswordResetEmail = PreparedEmail & {
  resetUrl: string;
  expiresAt: Date;
};

export type PreparedInviteEmail = PreparedEmail & {
  inviteUrl: string;
  expiresAt: Date;
};

export function getEmailDeliveryConfig() {
  const configuredProvider = ENV.emailProvider || "none";
  const provider = (["none", "smtp", "resend", "postmark", "sendgrid"] as const).includes(
    configuredProvider as EmailProvider
  )
    ? (configuredProvider as EmailProvider)
    : "none";
  // SMTP is intentionally reported as unavailable until a real SMTP transport is
  // configured. HTTP providers are implemented below without storing credentials
  // in the database or returning them to the client.
  const providerReady =
    provider === "smtp"
      ? false
      : provider === "none"
        ? false
        : Boolean(ENV.emailFrom && ENV.emailApiKey);
  return {
    enabled: ENV.emailDeliveryEnabled,
    provider,
    from: ENV.emailFrom,
    appUrl: ENV.publicAppUrl.replace(/\/$/, ""),
    providerReady,
    ready: ENV.emailDeliveryEnabled && provider !== "none" && providerReady,
  } as const;
}

export function buildPasswordResetUrl(
  token: string,
  appUrl = getEmailDeliveryConfig().appUrl
) {
  return `${appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildInviteUrl(
  token: string,
  appUrl = getEmailDeliveryConfig().appUrl
) {
  return `${appUrl.replace(/\/$/, "")}/invite/${encodeURIComponent(token)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function preparePasswordResetEmail(
  payload: PasswordResetEmailPayload,
  config = getEmailDeliveryConfig()
): PreparedPasswordResetEmail {
  const resetUrl = buildPasswordResetUrl(payload.token, config.appUrl);
  const greeting = `Olá${payload.name ? `, ${payload.name}` : ""}.`;
  const text = [
    greeting,
    "Recebemos um pedido para redefinir sua senha do Forte Panel.",
    `Use este link uma única vez: ${resetUrl}`,
    "O link expira em 30 minutos. Se você não fez este pedido, ignore esta mensagem.",
  ].join("\n\n");
  return {
    to: payload.to,
    from: config.from,
    subject: "Redefina sua senha do Forte Panel",
    resetUrl,
    expiresAt: payload.expiresAt,
    text,
    html: `<p>${escapeHtml(greeting)}</p><p>Recebemos um pedido para redefinir sua senha do Forte Panel.</p><p><a href="${escapeHtml(resetUrl)}">Criar uma nova senha</a></p><p>O link expira em 30 minutos e pode ser usado uma única vez.</p>`,
  };
}

export function prepareInviteEmail(
  payload: InviteEmailPayload,
  config = getEmailDeliveryConfig()
): PreparedInviteEmail {
  const inviteUrl = buildInviteUrl(payload.token, config.appUrl);
  const greeting = `Olá${payload.name ? `, ${payload.name}` : ""}.`;
  const text = [
    greeting,
    `Você foi convidado para operar o workspace ${payload.workspaceName} no Forte Panel como ${payload.role}.`,
    `Configure seu acesso neste link: ${inviteUrl}`,
    "O convite expira em 72 horas e só pode ser usado uma vez.",
  ].join("\n\n");
  return {
    to: payload.to,
    from: config.from,
    subject: `Convite para o Forte Panel · ${payload.workspaceName}`,
    inviteUrl,
    expiresAt: payload.expiresAt,
    text,
    html: `<p>${escapeHtml(greeting)}</p><p>Você foi convidado para operar o workspace <strong>${escapeHtml(payload.workspaceName)}</strong> no Forte Panel como <strong>${escapeHtml(payload.role)}</strong>.</p><p><a href="${escapeHtml(inviteUrl)}">Configurar meu acesso</a></p><p>O convite expira em 72 horas e só pode ser usado uma vez.</p>`,
  };
}

export async function sendPasswordResetEmail(
  payload: PasswordResetEmailPayload
): Promise<EmailDeliveryStatus> {
  return deliverEmail(preparePasswordResetEmail(payload));
}

export async function sendInviteEmail(
  payload: InviteEmailPayload
): Promise<EmailDeliveryStatus> {
  return deliverEmail(prepareInviteEmail(payload));
}

async function deliverEmail(email: PreparedEmail): Promise<EmailDeliveryStatus> {
  const config = getEmailDeliveryConfig();
  if (!config.ready) return "not_configured";
  if (config.provider === "none" || config.provider === "smtp")
    return "not_configured";
  const provider = config.provider;
  const apiKey = ENV.emailApiKey;
  const response = await fetch(providerUrl(provider), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...providerHeaders(provider, apiKey),
    },
    body: JSON.stringify(providerBody(provider, email)),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Email provider rejected message (${response.status}): ${body.slice(0, 240)}`);
  }
  return "sent";
}

function providerUrl(provider: Exclude<EmailProvider, "none" | "smtp">) {
  if (provider === "resend") return "https://api.resend.com/emails";
  if (provider === "postmark") return "https://api.postmarkapp.com/email";
  return "https://api.sendgrid.com/v3/mail/send";
}

function providerHeaders(
  provider: Exclude<EmailProvider, "none" | "smtp">,
  apiKey: string
): Record<string, string> {
  return provider === "postmark"
    ? { "X-Postmark-Server-Token": apiKey }
    : { Authorization: `Bearer ${apiKey}` };
}

function providerBody(
  provider: Exclude<EmailProvider, "none" | "smtp">,
  email: PreparedEmail
) {
  if (provider === "sendgrid") {
    return {
      personalizations: [{ to: [{ email: email.to }] }],
      from: { email: email.from },
      subject: email.subject,
      content: [
        { type: "text/plain", value: email.text },
        { type: "text/html", value: email.html },
      ],
    };
  }
  if (provider === "resend")
    return {
      from: email.from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    };
  return {
    From: email.from,
    To: email.to,
    Subject: email.subject,
    TextBody: email.text,
    HtmlBody: email.html,
  };
}

export function describeEmailDelivery() {
  const config = getEmailDeliveryConfig();
  if (!config.enabled) return "disabled" as const;
  if (!config.ready) return "not_configured" as const;
  return "ready" as const;
}
