const gatewayBaseUrl = () => (process.env.BAILEYS_BASE_URL ?? "").replace(/\/$/, "");
const instanceId = () => process.env.BAILEYS_INSTANCE_ID ?? "default";
const instanceName = () =>
  process.env.BAILEYS_INSTANCE_NAME?.trim() || `WhatsApp · ${instanceId()}`;
const maskSecret = (value: string | undefined) =>
  value ? `${value.slice(0, 3)}••••${value.slice(-3)}` : null;

async function gatewayRequest(path: string, init?: RequestInit) {
  const baseUrl = gatewayBaseUrl();
  const apiKey = process.env.BAILEYS_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${body || "Gateway WhatsApp respondeu"} (HTTP ${response.status})`
    );
  }
  return response;
}

export async function getBaileysStatus() {
  const id = encodeURIComponent(instanceId());
  const response = await gatewayRequest(`/api/instances/${id}`);
  if (!response)
    return {
      configured: false,
      instanceId: instanceId(),
      instanceName: instanceName(),
      status: "unconfigured" as const,
      qrAvailable: false,
      lastError: null,
      configuration: {
        gatewayUrl: gatewayBaseUrl() || null,
        apiKeyMasked: maskSecret(process.env.BAILEYS_API_KEY),
        webhookConfigured: Boolean(process.env.BAILEYS_WEBHOOK_SECRET),
        webhookUrl: "/api/v1/webhooks/providers/baileys",
        sessionPersistent: true,
        sessionEncrypted: Boolean(process.env.BAILEYS_SESSION_ENCRYPTION_KEY),
      },
    };
  const body = (await response.json()) as {
    status?: string;
    phoneNumber?: string;
    phone?: string;
    lastError?: string;
    updatedAt?: string;
  };
  return {
    configured: true,
    instanceId: instanceId(),
    instanceName: instanceName(),
    status: body.status ?? "unknown",
    phoneNumber: body.phoneNumber ?? body.phone ?? null,
    qrAvailable: body.status === "qr",
    lastError: body.lastError ?? null,
    updatedAt: body.updatedAt ?? null,
    configuration: {
      gatewayUrl: gatewayBaseUrl() || null,
      apiKeyMasked: maskSecret(process.env.BAILEYS_API_KEY),
      webhookConfigured: Boolean(process.env.BAILEYS_WEBHOOK_SECRET),
      webhookUrl: "/api/v1/webhooks/providers/baileys",
      sessionPersistent: true,
      sessionEncrypted: Boolean(process.env.BAILEYS_SESSION_ENCRYPTION_KEY),
    },
  };
}

export async function getBaileysQr() {
  const id = encodeURIComponent(instanceId());
  let response: Response | null;
  try {
    response = await gatewayRequest(`/api/instances/${id}/qr`);
  } catch (error) {
    if (error instanceof Error && /\b404\b/.test(error.message)) return null;
    throw error;
  }
  if (!response) return null;
  const body = (await response.json()) as { imageDataUrl?: string };
  return body.imageDataUrl ?? null;
}

export async function connectBaileys() {
  const id = encodeURIComponent(instanceId());
  const response = await gatewayRequest(`/api/instances/${id}/connect`, {
    method: "POST",
  });
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  return getBaileysStatus();
}

export async function disconnectBaileys(logout = false) {
  const id = encodeURIComponent(instanceId());
  const response = await gatewayRequest(
    `/api/instances/${id}/${logout ? "logout" : "disconnect"}`,
    { method: "POST" }
  );
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  return getBaileysStatus();
}
