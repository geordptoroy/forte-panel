import { afterEach, describe, expect, it, vi } from "vitest";
import { createPapiAdapter } from "./whatsapp";

const originalEnv = {
  baseUrl: process.env.PAPI_BASE_URL,
  apiKey: process.env.PAPI_API_KEY,
  sendPath: process.env.PAPI_SEND_MESSAGE_PATH,
  instanceId: process.env.PAPI_INSTANCE_ID,
};

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalEnv.baseUrl === undefined) delete process.env.PAPI_BASE_URL;
  else process.env.PAPI_BASE_URL = originalEnv.baseUrl;
  if (originalEnv.apiKey === undefined) delete process.env.PAPI_API_KEY;
  else process.env.PAPI_API_KEY = originalEnv.apiKey;
  if (originalEnv.sendPath === undefined) delete process.env.PAPI_SEND_MESSAGE_PATH;
  else process.env.PAPI_SEND_MESSAGE_PATH = originalEnv.sendPath;
  if (originalEnv.instanceId === undefined) delete process.env.PAPI_INSTANCE_ID;
  else process.env.PAPI_INSTANCE_ID = originalEnv.instanceId;
});

function configure() {
  process.env.PAPI_BASE_URL = "http://papi.test";
  process.env.PAPI_API_KEY = "secret";
  delete process.env.PAPI_SEND_MESSAGE_PATH;
  delete process.env.PAPI_INSTANCE_ID;
}

describe("PAPI outbound adapter", () => {
  it("sends text through the instance send-text endpoint", async () => {
    configure();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ key: { id: "papi-msg-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPapiAdapter().sendMessage({
      idempotencyKey: "forte-message-1",
      instanceId: "instance-1",
      phone: "+55 (11) 99999-9999",
      content: "Olá",
      messageType: "text",
    })).resolves.toMatchObject({ externalId: "papi-msg-1", status: "sent" });

    expect(fetchMock).toHaveBeenCalledWith("http://papi.test/api/instances/instance-1/send-text", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-api-key": "secret", "Idempotency-Key": "forte-message-1" }),
      body: JSON.stringify({ jid: "5511999999999", text: "Olá" }),
    }));
  });

  it("sends audio as PTT to the correct PAPI instance", async () => {
    configure();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "audio-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createPapiAdapter().sendMessage({
      idempotencyKey: "forte-message-2",
      instanceId: "instance-audio",
      phone: "5511999999999",
      content: "https://cdn.example.test/audio.ogg",
      messageType: "audio",
      metadata: { ptt: true },
    });

    expect(fetchMock).toHaveBeenCalledWith("http://papi.test/api/instances/instance-audio/send-audio", expect.objectContaining({
      body: JSON.stringify({ jid: "5511999999999", url: "https://cdn.example.test/audio.ogg", ptt: true }),
    }));
  });

  it("sends interactive buttons with their metadata", async () => {
    configure();
    const buttons = [{ id: "agenda", displayText: "Agendar" }, { id: "duvida", displayText: "Tirar dúvida" }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "button-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createPapiAdapter().sendMessage({
      idempotencyKey: "forte-message-3",
      instanceId: "instance-buttons",
      phone: "5511999999999",
      content: "Como posso ajudar?",
      messageType: "button",
      metadata: { buttons, footer: "Forte Panel", headerType: "none" },
    });

    expect(fetchMock).toHaveBeenCalledWith("http://papi.test/api/instances/instance-buttons/send-buttons", expect.objectContaining({
      body: JSON.stringify({ jid: "5511999999999", text: "Como posso ajudar?", footer: "Forte Panel", buttons, headerType: "none" }),
    }));
  });

  it("fails before enqueue when a PAPI instance is missing", async () => {
    configure();
    await expect(createPapiAdapter().sendMessage({ idempotencyKey: "forte-message-4", phone: "5511999999999", content: "Oi" }))
      .rejects.toThrow("instanceId não informado");
  });

  it("preserves messages sent from the owner as fromMe", () => {
    const normalized = createPapiAdapter().normalizeInbound({ data: { message: { key: { id: "m-owner", remoteJid: "5511999999999@s.whatsapp.net", fromMe: true }, messageType: "text", text: "Resposta manual", timestamp: 1770000000 } } });
    expect(normalized.fromMe).toBe(true);
    expect(normalized.metadata?.fromMe).toBe(true);
    expect(normalized.eventId).toBe("m-owner");
  });
});
