const gatewayBaseUrl = () => (process.env.BAILEYS_BASE_URL ?? "").replace(/\/$/, "");
const defaultInstanceId = () => process.env.BAILEYS_INSTANCE_ID ?? "default";
const defaultInstanceName = () =>
  process.env.BAILEYS_INSTANCE_NAME?.trim() || `WhatsApp · ${defaultInstanceId()}`;
const defaultInstanceSettings = {
  rejectCalls: false,
  rejectGroups: true,
  logCalls: true,
  ignoreStatusUpdates: true,
};
const maskSecret = (value: string | undefined) =>
  value ? `${value.slice(0, 3)}••••${value.slice(-3)}` : null;

async function gatewayRequest(
  path: string,
  init?: RequestInit,
  timeoutMs = 8_000
) {
  const baseUrl = gatewayBaseUrl();
  const apiKey = process.env.BAILEYS_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${body || "Gateway WhatsApp respondeu"} (HTTP ${response.status})`
    );
  }
  return response;
}

function jsonHeaders() {
  return { "content-type": "application/json" };
}

export function isGatewayNotFound(error: unknown) {
  return error instanceof Error && /HTTP 404\b/.test(error.message);
}

export async function createBaileysInstance(instanceId: string, name: string) {
  const response = await gatewayRequest("/api/instances", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ instanceId, name }),
  });
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  return response.json();
}

export async function updateBaileysInstanceName(
  instanceId: string,
  name: string
) {
  const id = encodeURIComponent(instanceId);
  const response = await gatewayRequest(`/api/instances/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  return response.json();
}

export async function updateBaileysInstanceSettings(
  instanceId: string,
  settings: typeof defaultInstanceSettings
) {
  const id = encodeURIComponent(instanceId);
  const response = await gatewayRequest(`/api/instances/${id}/settings`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ settings }),
  });
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  return response.json();
}

export async function updateBaileysWebhookSecret(
  instanceId: string,
  secret: string
) {
  const id = encodeURIComponent(instanceId);
  const response = await gatewayRequest(`/api/instances/${id}/webhook-secret`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ secret }),
  });
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  return response.json();
}

export async function deleteBaileysInstance(instanceId: string) {
  const id = encodeURIComponent(instanceId);
  const response = await gatewayRequest(`/api/instances/${id}`, {
    method: "DELETE",
  });
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  return response.json();
}

export async function getBaileysStatus(instanceId = defaultInstanceId()) {
  const id = encodeURIComponent(instanceId);
  const response = await gatewayRequest(`/api/instances/${id}`);
  if (!response)
    return {
      configured: false,
      instanceId,
      instanceName:
        instanceId === defaultInstanceId() ? defaultInstanceName() : `WhatsApp · ${instanceId}`,
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
    instanceId?: string;
    instanceName?: string;
    status?: string;
    phoneNumber?: string;
    phone?: string;
    lastError?: string;
    updatedAt?: string;
    settings?: Partial<typeof defaultInstanceSettings>;
  };
  return {
    configured: true,
    instanceId: body.instanceId ?? instanceId,
    instanceName:
      body.instanceName ??
      (instanceId === defaultInstanceId()
        ? defaultInstanceName()
        : `WhatsApp · ${instanceId}`),
    status: body.status ?? "unknown",
    settings: {
      rejectCalls:
        typeof body.settings?.rejectCalls === "boolean"
          ? body.settings.rejectCalls
          : defaultInstanceSettings.rejectCalls,
      rejectGroups:
        typeof body.settings?.rejectGroups === "boolean"
          ? body.settings.rejectGroups
          : defaultInstanceSettings.rejectGroups,
      logCalls:
        typeof body.settings?.logCalls === "boolean"
          ? body.settings.logCalls
          : defaultInstanceSettings.logCalls,
      ignoreStatusUpdates:
        typeof body.settings?.ignoreStatusUpdates === "boolean"
          ? body.settings.ignoreStatusUpdates
          : defaultInstanceSettings.ignoreStatusUpdates,
    },
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

export async function getBaileysProfile(instanceId: string) {
  const id = encodeURIComponent(instanceId);
  const response = await gatewayRequest(`/api/instances/${id}/profile`);
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  return response.json() as Promise<{
    phoneNumber: string | null;
    pushName: string | null;
    profilePictureUrl: string | null;
  }>;
}

export async function getBaileysQr(instanceId = defaultInstanceId()) {
  const id = encodeURIComponent(instanceId);
  let response: Response | null;
  try {
    response = await gatewayRequest(`/api/instances/${id}/qr`);
  } catch (error) {
    if (isGatewayNotFound(error)) return null;
    throw error;
  }
  if (!response) return null;
  const body = (await response.json()) as { imageDataUrl?: string };
  return body.imageDataUrl ?? null;
}

export async function connectBaileys(instanceId = defaultInstanceId()) {
  const id = encodeURIComponent(instanceId);
  const response = await gatewayRequest(`/api/instances/${id}/connect`, {
    method: "POST",
  });
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  return getBaileysStatus(instanceId);
}

export async function requestBaileysPairingCode(
  instanceId: string,
  phone: string
) {
  const id = encodeURIComponent(instanceId);
  const response = await gatewayRequest(`/api/instances/${id}/pairing-code`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ phone }),
  }, 55_000);
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  const body = (await response.json()) as { code?: string };
  if (!body.code) throw new Error("Gateway não retornou o código de pareamento");
  return { code: body.code };
}

export async function disconnectBaileys(
  instanceId: string,
  logout = false
) {
  const id = encodeURIComponent(instanceId);
  const response = await gatewayRequest(
    `/api/instances/${id}/${logout ? "logout" : "disconnect"}`,
    { method: "POST" }
  );
  if (!response) throw new Error("Gateway WhatsApp não está configurado");
  return getBaileysStatus(instanceId);
}
