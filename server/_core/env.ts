export type LocalPlatformAdminAccount = {
  email: string;
  password: string;
  openId: string;
  name: string;
};

function stableLocalPlatformAdminOpenId(email: string) {
  return `local_platform_admin:${email.trim().toLowerCase()}`;
}

export function parseLocalPlatformAdminAccounts(
  raw: string | undefined,
  fallback: { email: string; password: string }
): LocalPlatformAdminAccount[] {
  const legacyFallback = fallback.password
    ? {
        email: fallback.email.trim().toLowerCase(),
        password: fallback.password,
        openId: "local_admin",
        name: "Administrador da plataforma",
      }
    : null;
  if (!raw?.trim()) return legacyFallback ? [legacyFallback] : [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("PLATFORM_ADMIN_ACCOUNTS_JSON inválido");
  }
  if (!Array.isArray(parsed) || parsed.length < 1)
    throw new Error("PLATFORM_ADMIN_ACCOUNTS_JSON deve conter uma lista de contas");
  const accounts = parsed.map((item, index) => {
    if (!item || typeof item !== "object")
      throw new Error(`Conta de Console Admin inválida na posição ${index}`);
    const value = item as Record<string, unknown>;
    const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
    const password = typeof value.password === "string" ? value.password : "";
    if (!email || !email.includes("@") || password.length < 8)
      throw new Error(`Conta de Console Admin inválida na posição ${index}`);
    const openId = typeof value.openId === "string" && value.openId.trim()
      ? value.openId.trim()
      : stableLocalPlatformAdminOpenId(email);
    const name = typeof value.name === "string" && value.name.trim()
      ? value.name.trim()
      : "Administrador da plataforma";
    return { email, password, openId, name };
  });
  if (legacyFallback && !accounts.some(account => account.email === legacyFallback.email))
    accounts.push(legacyFallback);
  return accounts;
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? process.env.OPENAI_API_BASE ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  localAuthEnabled: process.env.LOCAL_AUTH_ENABLED === "true",
  localAdminEmail: process.env.LOCAL_ADMIN_EMAIL ?? "admin@fortepanel.local",
  localAdminPassword: process.env.LOCAL_ADMIN_PASSWORD ?? "",
  localPlatformAdminAccounts: parseLocalPlatformAdminAccounts(
    process.env.PLATFORM_ADMIN_ACCOUNTS_JSON,
    {
      email: process.env.LOCAL_ADMIN_EMAIL ?? "admin@fortepanel.local",
      password: process.env.LOCAL_ADMIN_PASSWORD ?? "",
    }
  ),
  emailDeliveryEnabled: process.env.EMAIL_DELIVERY_ENABLED === "true",
  emailProvider: process.env.EMAIL_PROVIDER ?? "none",
  emailFrom: process.env.EMAIL_FROM ?? "",
  emailApiKey: process.env.EMAIL_API_KEY ?? "",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://localhost:3000",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
};
