import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebhookOutbox } from "./webhook-outbox.js";

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 1_000
) => {
  const started = Date.now();
  while (!(await condition())) {
    if (Date.now() - started > timeoutMs) throw new Error("condition timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

describe("durable webhook outbox", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))
    );
  });

  it("persists an event, signs it and removes it after delivery", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forte-outbox-"));
    directories.push(directory);
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        "x-webhook-secret": "secret",
      });
      expect(init?.body).toContain('"eventId":"event-1"');
      expect(init?.headers).toHaveProperty("x-webhook-signature");
      return new Response("ok", { status: 202 });
    });
    const outbox = new WebhookOutbox({
      directory,
      url: "https://panel.example/webhook",
      secret: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger,
    });

    await outbox.start();
    await outbox.enqueue({ eventId: "event-1", content: "Olá" });
    await waitFor(() => fetchImpl.mock.calls.length === 1);
    await waitFor(async () => (await fs.readdir(directory)).every(file => !file.endsWith(".json")));
    await outbox.flush();
    await outbox.stop();

    expect((await fs.readdir(directory)).filter(file => file.endsWith(".json"))).toHaveLength(0);
    expect(outbox.getStatus().pending).toBe(0);
  });

  it("keeps a failed event on disk and retries it after backoff", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forte-outbox-"));
    directories.push(directory);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 202 }));
    const warnCallsBefore = logger.warn.mock.calls.length;
    const outbox = new WebhookOutbox({
      directory,
      url: "https://panel.example/webhook",
      secret: "secret",
      maxAttempts: 1,
      initialBackoffMs: 20,
      maxBackoffMs: 20,
      fetchImpl,
      logger,
    });

    await outbox.start();
    await outbox.enqueue({ eventId: "event-2", content: "retry" });
    await waitFor(() => fetchImpl.mock.calls.length === 1);
    await waitFor(() => logger.warn.mock.calls.length > warnCallsBefore);
    expect((await fs.readdir(directory)).some(file => file.endsWith(".json"))).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 70));
    await outbox.flush();
    await waitFor(() => fetchImpl.mock.calls.length === 2);
    await outbox.stop();

    expect((await fs.readdir(directory)).filter(file => file.endsWith(".json"))).toHaveLength(0);
  });
});
