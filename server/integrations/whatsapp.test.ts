import { afterEach, describe, expect, it, vi } from "vitest";
import { createBaileysAdapter, createPapiAdapter } from "./whatsapp";

const originalEnv = {
  baseUrl: process.env.PAPI_BASE_URL,
  apiKey: process.env.PAPI_API_KEY,
  sendPath: process.env.PAPI_SEND_MESSAGE_PATH,
  instanceId: process.env.PAPI_INSTANCE_ID,
  baileysBaseUrl: process.env.BAILEYS_BASE_URL,
  baileysApiKey: process.env.BAILEYS_API_KEY,
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
  if (originalEnv.baileysBaseUrl === undefined) delete process.env.BAILEYS_BASE_URL;
  else process.env.BAILEYS_BASE_URL = originalEnv.baileysBaseUrl;
  if (originalEnv.baileysApiKey === undefined) delete process.env.BAILEYS_API_KEY;
  else process.env.BAILEYS_API_KEY = originalEnv.baileysApiKey;
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

describe("Baileys adapter JID routing", () => {
  it("preserves an instance-scoped group JID, subject, and author identity", () => {
    const normalized = createBaileysAdapter().normalizeInbound({
      eventId: "instance-a:message:group-fixture",
      instanceId: "instance-a",
      phone: "120363012345678901",
      jid: "120363012345678901@g.us",
      name: "Reforma 2026",
      content: "Alguém consegue ver o orçamento?",
      messageType: "text",
      metadata: {
        provider: "baileys",
        jid: "120363012345678901@g.us",
        isGroup: true,
        groupJid: "120363012345678901@g.us",
        groupSubject: "Reforma 2026",
        authorJid: "55110001@s.whatsapp.net",
        authorName: "Ana",
      },
    });

    expect(normalized).toMatchObject({
      eventId: "instance-a:message:group-fixture",
      name: "Reforma 2026",
      content: "Alguém consegue ver o orçamento?",
      metadata: {
        provider: "baileys",
        instanceId: "instance-a",
        isGroup: true,
        groupJid: "120363012345678901@g.us",
        groupSubject: "Reforma 2026",
        authorJid: "55110001@s.whatsapp.net",
        authorName: "Ana",
      },
    });
  });

  it("preserves the exact plain-text `oi` from the gateway outbox envelope", () => {
    const normalized = createBaileysAdapter().normalizeInbound({
      eventId: "fixture-oi-1",
      instanceId: "workspace-a-instance-1",
      phone: "5511999999999",
      jid: "5511999999999@s.whatsapp.net",
      content: "oi",
      messageType: "text",
      fromMe: false,
      metadata: {
        provider: "baileys",
        messageId: "fixture-oi-1",
        jid: "5511999999999@s.whatsapp.net",
      },
    });

    expect(normalized).toMatchObject({
      eventId: "fixture-oi-1",
      content: "oi",
      messageType: "text",
      fromMe: false,
      metadata: {
        provider: "baileys",
        instanceId: "workspace-a-instance-1",
      },
    });
  });

  it.each([
    {
      eventId: "fixture-image-1",
      messageType: "image",
      content: "[imagem recebida]",
      mediaData: "data:image/jpeg;base64,AQ==",
      mediaMimeType: "image/jpeg",
    },
    {
      eventId: "fixture-audio-1",
      messageType: "audio",
      content: "[áudio recebido]",
      mediaData: "data:audio/ogg;base64,AQ==",
      mediaMimeType: "audio/ogg",
    },
  ])("preserves $messageType content and media metadata", fixture => {
    const normalized = createBaileysAdapter().normalizeInbound({
      ...fixture,
      instanceId: "workspace-a-instance-1",
      phone: "5511999999999",
      metadata: {
        provider: "baileys",
        mediaData: fixture.mediaData,
        mediaMimeType: fixture.mediaMimeType,
      },
    });
    expect(normalized).toMatchObject({
      content: fixture.content,
      messageType: fixture.messageType,
      metadata: {
        provider: "baileys",
        instanceId: "workspace-a-instance-1",
        mediaData: fixture.mediaData,
        mediaMimeType: fixture.mediaMimeType,
      },
    });
  });

  it("preserves manual fromMe in the gateway webhook envelope", () => {
    const normalized = createBaileysAdapter().normalizeInbound({
      eventId: "fixture-manual-fromme",
      instanceId: "workspace-a-instance-1",
      phone: "5511999999999",
      content: "oi",
      messageType: "text",
      fromMe: true,
      metadata: { provider: "baileys", jid: "5511999999999@s.whatsapp.net" },
    });
    expect(normalized.fromMe).toBe(true);
    expect(normalized.metadata).toMatchObject({
      provider: "baileys",
      instanceId: "workspace-a-instance-1",
      fromMe: true,
    });
  });

  it("preserves the inbound JID for replies to LID contacts", () => {
    const normalized = createBaileysAdapter().normalizeInbound({
      eventId: "baileys-inbound-1",
      phone: "1234567890@lid",
      content: "Oi",
      metadata: { provider: "baileys", jid: "1234567890@lid" },
    });
    expect(normalized.phone).toBe("1234567890");
    expect(normalized.metadata).toMatchObject({ provider: "baileys", jid: "1234567890@lid" });
  });

  it("accepts a top-level JID from the gateway webhook contract", () => {
    const normalized = createBaileysAdapter().normalizeInbound({
      eventId: "baileys-inbound-2",
      instanceId: "default",
      phone: "1234567890@lid",
      jid: "1234567890@lid",
      content: "Mensagem nova",
      metadata: { provider: "baileys", messageId: "msg-2" },
    });
    expect(normalized.metadata).toMatchObject({ jid: "1234567890@lid", messageId: "msg-2" });
  });

  it("sends through the gateway using the preserved JID instead of rebuilding a phone JID", async () => {
    process.env.BAILEYS_BASE_URL = "http://baileys.test";
    process.env.BAILEYS_API_KEY = "secret";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ externalId: "baileys-msg-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createBaileysAdapter().sendMessage({
      idempotencyKey: "forte-message-baileys-1",
      instanceId: "workspace-session-1",
      phone: "1234567890",
      content: "Resposta",
      messageType: "text",
      metadata: { jid: "1234567890@lid" },
    })).resolves.toMatchObject({ externalId: "baileys-msg-1", status: "sent" });
    expect(fetchMock).toHaveBeenCalledWith("http://baileys.test/api/instances/workspace-session-1/send", expect.objectContaining({
      body: JSON.stringify({ phone: "1234567890@lid", messageType: "text", content: "Resposta", metadata: { jid: "1234567890@lid" } }),
    }));
  });

  it("fails closed instead of using a global default when instanceId is missing", async () => {
    process.env.BAILEYS_BASE_URL = "http://baileys.test";
    process.env.BAILEYS_API_KEY = "secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createBaileysAdapter().sendMessage({
      idempotencyKey: "forte-message-baileys-no-instance",
      phone: "5511999999999",
      content: "Não enviar por fallback",
      messageType: "text",
    })).rejects.toThrow("instanceId não informado para envio Baileys");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
