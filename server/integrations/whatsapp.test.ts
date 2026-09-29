import { afterEach, describe, expect, it, vi } from "vitest";
import { createBaileysAdapter } from "./whatsapp";

const originalEnv = {
  baileysBaseUrl: process.env.BAILEYS_BASE_URL,
  baileysApiKey: process.env.BAILEYS_API_KEY,
};

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalEnv.baileysBaseUrl === undefined) delete process.env.BAILEYS_BASE_URL;
  else process.env.BAILEYS_BASE_URL = originalEnv.baileysBaseUrl;
  if (originalEnv.baileysApiKey === undefined) delete process.env.BAILEYS_API_KEY;
  else process.env.BAILEYS_API_KEY = originalEnv.baileysApiKey;
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

  it("preserves Baileys history and placeholder provenance for the server guard", () => {
    const normalized = createBaileysAdapter().normalizeInbound({
      eventId: "fixture-placeholder-1",
      instanceId: "workspace-a-instance-1",
      phone: "5511999999999",
      content: "[mensagem recebida]",
      messageType: "text",
      metadata: {
        upsertType: "notify",
        isPlaceholder: true,
        requestId: "offline-backfill-1",
      },
    });

    expect(normalized.metadata).toMatchObject({
      provider: "baileys",
      instanceId: "workspace-a-instance-1",
      upsertType: "notify",
      isPlaceholder: true,
      requestId: "offline-backfill-1",
    });
  });
  it("preserves top-level historySync from the Baileys webhook envelope", () => {
    const normalized = createBaileysAdapter().normalizeInbound({
      eventId: "fixture-history-envelope",
      instanceId: "workspace-a-instance-1",
      phone: "5511999999999",
      content: "mensagem antiga",
      messageType: "text",
      historySync: true,
      metadata: { provider: "baileys", upsertType: "append" },
    });
    expect(normalized.metadata).toMatchObject({
      provider: "baileys",
      instanceId: "workspace-a-instance-1",
      historySync: true,
      upsertType: "append",
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
