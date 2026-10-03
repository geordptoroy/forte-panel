const PLACEHOLDER_MARKERS = [
  "CHANGE_ME",
  "REPLACE_ME",
  "EXAMPLE",
  "<segredo",
  "<secret",
];

function isPlaceholder(value: string) {
  const normalized = value.trim().toUpperCase();
  return PLACEHOLDER_MARKERS.some(marker =>
    normalized.includes(marker.toUpperCase())
  );
}

function requiredSecret(
  env: NodeJS.ProcessEnv,
  name: string,
  errors: string[]
) {
  const value = env[name]?.trim() ?? "";
  if (value.length < 32 || isPlaceholder(value))
    errors.push(
      `${name} must be a non-placeholder secret with at least 32 characters`
    );
}

export function validateProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  const errors: string[] = [];
  if (env.NODE_ENV !== "production")
    errors.push("NODE_ENV=production is required");
  if (!/^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL?.trim() ?? ""))
    errors.push("DATABASE_URL must be a PostgreSQL URL");
  requiredSecret(env, "JWT_SECRET", errors);
  if (env.FORTE_SECURITY_FAIL_CLOSED !== "true")
    errors.push("FORTE_SECURITY_FAIL_CLOSED=true is required explicitly");
  if (env.DEMO_MODE === "true") errors.push("DEMO_MODE must be false");
  if (env.WORKSPACE_BOOTSTRAP_ENABLED === "true")
    errors.push("WORKSPACE_BOOTSTRAP_ENABLED must be false");

  if (env.BAILEYS_BASE_URL?.trim()) {
    requiredSecret(env, "BAILEYS_API_KEY", errors);
    requiredSecret(env, "BAILEYS_WEBHOOK_SECRET", errors);
    requiredSecret(env, "WHATSAPP_SESSION_ENCRYPTION_KEY", errors);
  }
  if (env.FORTE_PUBLIC_API_ENABLED === "true") {
    requiredSecret(env, "FORTE_API_KEY", errors);
    if (!env.FORTE_API_WORKSPACE_ID?.trim())
      errors.push(
        "FORTE_API_WORKSPACE_ID is required when public API is enabled"
      );
  }
  return { ok: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateProductionConfig();
  if (!result.ok) {
    console.error("Production configuration is invalid:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Production configuration passed fail-closed checks.");
  }
}
