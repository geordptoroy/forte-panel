const gatewayBaseUrl = () => (process.env.BAILEYS_BASE_URL ?? "").replace(/\/$/, "");
const instanceId = () => process.env.BAILEYS_INSTANCE_ID ?? "default";

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
    throw new Error(body || `Gateway WhatsApp respondeu ${response.status}`);
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
      status: "unconfigured" as const,
      qrAvailable: false,
      lastError: null,
    };
  const body = (await response.json()) as {
    status?: string;
    phoneNumber?: string;
    lastError?: string;
  };
  return {
    configured: true,
    instanceId: instanceId(),
    status: body.status ?? "unknown",
    phoneNumber: body.phoneNumber ?? null,
    qrAvailable: body.status === "qr",
    lastError: body.lastError ?? null,
  };
}

export async function getBaileysQr() {
  const id = encodeURIComponent(instanceId());
  const response = await gatewayRequest(`/api/instances/${id}/qr`);
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
