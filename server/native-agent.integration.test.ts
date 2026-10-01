import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  agentRuns,
  auditLogs,
  contacts,
  conversations,
  messages,
  workspaceSettings,
  workspaces,
} from "../drizzle/schema";
import { getDb, getNativeAgentKillSwitch, setNativeAgentKillSwitch } from "./db";
import { runNativeAgent } from "./native-agent";
import type { AgentProviderSettings } from "./llm-providers";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

const settings: AgentProviderSettings = {
  providers: {
    nvidia_nim: { enabled: false, baseUrl: "", apiKey: "" },
    google_gemini: {
      enabled: true,
      baseUrl: "https://synthetic-provider.invalid/v1",
      apiKey: "synthetic-key",
    },
    openai_compatible: { enabled: false, baseUrl: "", apiKey: "" },
  },
  routing: {
    text: { provider: "google_gemini", model: "synthetic-text" },
    vision: { provider: "google_gemini", model: "synthetic-vision" },
    audio: { provider: "google_gemini", model: "synthetic-audio" },
    document: { provider: "google_gemini", model: "synthetic-document" },
  },
};

describe.skipIf(!hasDatabase)("native agent controlled resume", () => {
  const suffix = `agentresume${Date.now()}`;
  let workspaceId = 0;
  const contactsByType = new Map<string, { contactId: number; conversationId: number }>();
  const eventIds = ["text", "audio", "image", "document"].map(type => `synthetic:${type}:${suffix}`);

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: `Agent Resume ${suffix}`,
        slug: `agent-resume-${suffix}`,
        timezone: "America/Sao_Paulo",
      })
      .returning({ id: workspaces.id });
    workspaceId = workspace.id;

    const types = ["text", "audio", "image", "document"] as const;
    for (const [index, type] of types.entries()) {
      const [contact] = await db
        .insert(contacts)
        .values({
          workspaceId,
          externalPhone: `551199${Date.now()}${index}`.slice(0, 32),
          name: `Lead ${type}`,
          aiEnabled: 1,
        })
        .returning({ id: contacts.id });
      const [conversation] = await db
        .insert(conversations)
        .values({ contactId: contact.id, humanControlled: 0 })
        .returning({ id: conversations.id });
      contactsByType.set(type, {
        contactId: contact.id,
        conversationId: conversation.id,
      });
    }
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    const db = await getDb();
    if (!db || !workspaceId) return;
    const contactIds = [...contactsByType.values()].map(value => value.contactId);
    await db.delete(agentRuns).where(eq(agentRuns.workspaceId, workspaceId));
    await db.delete(auditLogs).where(eq(auditLogs.workspaceId, workspaceId));
    if (contactIds.length) {
      await db.delete(messages).where(
        inArray(
          messages.conversationId,
          [...contactsByType.values()].map(value => value.conversationId)
        )
      );
      await db.delete(conversations).where(inArray(conversations.contactId, contactIds));
      await db.delete(contacts).where(inArray(contacts.id, contactIds));
    }
    await db.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });

  it("resumes only after authorized unpause and records capability telemetry", async () => {
    await setNativeAgentKillSwitch({
      workspaceId,
      paused: true,
      reason: "provider sintético em validação",
      actorUserId: 0,
    });
    expect((await getNativeAgentKillSwitch(workspaceId)).paused).toBe(true);

    await setNativeAgentKillSwitch({
      workspaceId,
      paused: false,
      reason: "retomada controlada",
      actorUserId: 0,
    });
    expect((await getNativeAgentKillSwitch(workspaceId)).paused).toBe(false);

    const calls: Array<{ model?: string; messages?: Array<{ role: string; content: unknown }> }> = [];
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)) as {
        model?: string;
        messages?: Array<{ role: string; content: unknown }>;
      };
      calls.push(payload);
      const userContent = payload.messages?.at(-1)?.content;
      const isMediaPreflight = Array.isArray(userContent) ||
        payload.messages?.some(message => typeof message.content === "string" && message.content.includes("somente a transcrição literal"));
      const content = isMediaPreflight
        ? payload.messages?.some(message => typeof message.content === "string" && message.content.includes("transcrição"))
          ? "Cliente quer confirmar um horário."
          : "Documento sintético validado."
        : `Resposta sintética para ${payload.model}`;
      return new Response(JSON.stringify({ model: payload.model, choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const types = ["text", "audio", "image", "document"] as const;
    for (const type of types) {
      const record = contactsByType.get(type);
      if (!record) throw new Error(`fixture ausente: ${type}`);
      await runNativeAgent(
        {
          eventId: `synthetic:${type}:${suffix}`,
          workspaceId,
          contactId: record.contactId,
          conversationId: record.conversationId,
          content: `mensagem ${type}`,
          messageType: type,
          metadata:
            type === "text"
              ? undefined
              : { mediaData: `https://synthetic-provider.invalid/${type}`, mediaMimeType: type === "audio" ? "audio/ogg" : type === "image" ? "image/jpeg" : "application/pdf" },
        },
        {
          enabled: true,
          model: `synthetic-${type}`,
          systemPrompt: "Responda de forma curta.",
          maxSteps: 1,
          llm: settings,
        }
      );
    }

    expect(fetchMock).toHaveBeenCalled();
    expect(calls.length).toBe(7);
    expect(calls.filter(call => call.model === "synthetic-text")).toHaveLength(1);
    expect(calls.filter(call => call.model === "synthetic-audio")).toHaveLength(2);
    expect(calls.filter(call => call.model === "synthetic-image")).toHaveLength(2);
    expect(calls.filter(call => call.model === "synthetic-document")).toHaveLength(2);

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const runs = await db
      .select({ eventId: agentRuns.eventId, outcome: agentRuns.outcome, provider: agentRuns.provider, capability: agentRuns.capability, transcriptionProvider: agentRuns.transcriptionProvider, mediaAnalysisProvider: agentRuns.mediaAnalysisProvider })
      .from(agentRuns)
      .where(and(eq(agentRuns.workspaceId, workspaceId), inArray(agentRuns.eventId, eventIds)));
    expect(runs).toHaveLength(4);
    expect(runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: eventIds[0], outcome: "resolved", provider: "google_gemini", capability: "text" }),
      expect.objectContaining({ eventId: eventIds[1], outcome: "resolved", transcriptionProvider: "google_gemini" }),
      expect.objectContaining({ eventId: eventIds[2], outcome: "resolved", mediaAnalysisProvider: "google_gemini" }),
      expect.objectContaining({ eventId: eventIds[3], outcome: "resolved", mediaAnalysisProvider: "google_gemini" }),
    ]));
  });
});
