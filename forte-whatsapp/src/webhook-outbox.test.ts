import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
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
        "x-webhook-instance-id": "instance-1",
      });
      expect(init?.body).toContain('"eventId":"event-1"');
      expect(init?.headers).toHaveProperty("x-webhook-signature");
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-webhook-timestamp"]).toMatch(/^\d{10}$/);
      expect(headers["x-webhook-nonce"]).toMatch(/^[A-Za-z0-9._:-]{16,180}$/);
      const expected = `sha256=${crypto
        .createHmac("sha256", "secret")
        .update(`${headers["x-webhook-timestamp"]}.${headers["x-webhook-nonce"]}.${String(init?.body)}`)
        .digest("hex")}`;
      expect(headers["x-webhook-signature"]).toBe(expected);
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
    await outbox.enqueue({ eventId: "event-1", instanceId: "instance-1", content: "Olá" });
    await waitFor(() => fetchImpl.mock.calls.length === 1);
    await waitFor(async () => (await fs.readdir(directory)).every(file => !file.endsWith(".json")));
    await outbox.flush();
    await outbox.stop();

    expect((await fs.readdir(directory)).filter(file => file.endsWith(".json"))).toHaveLength(0);
    expect(outbox.getStatus().pending).toBe(0);
  });

  it("flushes events enqueued while a previous flush is still in flight", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forte-outbox-"));
    directories.push(directory);
    await fs.writeFile(
      path.join(directory, "initial.json"),
      JSON.stringify({
        payload: { eventId: "event-initial", content: "first" },
        attempts: 0,
        nextAttemptAt: new Date(0).toISOString(),
        createdAt: new Date().toISOString(),
      })
    );

    let releaseFirstRequest!: () => void;
    const firstRequest = new Promise<void>(resolve => {
      releaseFirstRequest = resolve;
    });
    let callCount = 0;
    const fetchImpl = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) await firstRequest;
      return new Response("ok", { status: 202 });
    });
    const outbox = new WebhookOutbox({
      directory,
      url: "https://panel.example/webhook",
      secret: "secret",
      fetchImpl,
      logger,
    });

    await outbox.start();
    await waitFor(() => fetchImpl.mock.calls.length === 1);
    await outbox.enqueue({ eventId: "event-during-flush", content: "second" });
    releaseFirstRequest();
    await waitFor(() => fetchImpl.mock.calls.length === 2);
    await outbox.flush();
    await outbox.stop();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
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

  it("moves a permanent HTTP 4xx failure to dead letter without retrying", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forte-outbox-"));
    directories.push(directory);
    const fetchImpl = vi.fn(async () => new Response("invalid", { status: 400 }));
    const outbox = new WebhookOutbox({
      directory,
      url: "https://panel.example/webhook",
      secret: "secret",
      maxAttempts: 8,
      initialBackoffMs: 20,
      maxBackoffMs: 20,
      fetchImpl,
      logger,
    });

    await outbox.start();
    await outbox.enqueue({ eventId: "event-permanent-4xx", content: "invalid" });
    await waitFor(() => fetchImpl.mock.calls.length === 1);
    await waitFor(async () => {
      const deadLetter = path.join(directory, "dead-letter");
      return (await fs.readdir(deadLetter).catch(() => [])).length === 1;
    });
    await waitFor(
      async () =>
        (await fs.readdir(directory)).filter(file => file.endsWith(".json")).length === 0
    );
    await outbox.stop();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await fs.readdir(directory)).filter(file => file.endsWith(".json"))).toHaveLength(0);
    const deadLetter = path.join(directory, "dead-letter");
    const [file] = await fs.readdir(deadLetter);
    await expect(fs.readFile(path.join(deadLetter, file), "utf8")).resolves.toContain(
      '\"quarantineReason\":\"permanent_webhook_failure\"'
    );
    expect(outbox.getStatus().pending).toBe(0);
    expect(outbox.getStatus().deadLetter).toBe(1);
  });

  it.each([408, 429])("retries HTTP %i instead of moving it to dead letter", async status => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forte-outbox-"));
    directories.push(directory);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("retry later", { status }))
      .mockResolvedValueOnce(new Response("ok", { status: 202 }));
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
    await outbox.enqueue({ eventId: `event-retry-${status}`, content: "retry" });
    await waitFor(() => fetchImpl.mock.calls.length === 1);
    await new Promise(resolve => setTimeout(resolve, 70));
    await outbox.flush();
    await waitFor(() => fetchImpl.mock.calls.length === 2);
    await outbox.stop();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(outbox.getStatus().pending).toBe(0);
    expect(outbox.getStatus().deadLetter).toBe(0);
    expect(await fs.readdir(path.join(directory, "dead-letter")).catch(() => [])).toHaveLength(0);
  });

  it("recovers a pending file while preserving an existing dead letter", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forte-outbox-"));
    directories.push(directory);
    const deadLetter = path.join(directory, "dead-letter");
    await fs.mkdir(deadLetter, { recursive: true });
    await fs.writeFile(
      path.join(deadLetter, "previous.permanent_webhook_failure.json"),
      JSON.stringify({ quarantineReason: "permanent_webhook_failure" })
    );
    await fs.writeFile(
      path.join(directory, "pending.json"),
      JSON.stringify({
        payload: { eventId: "event-recovered", content: "recover" },
        attempts: 0,
        nextAttemptAt: new Date(0).toISOString(),
        createdAt: new Date().toISOString(),
      })
    );
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 202 }));
    const outbox = new WebhookOutbox({
      directory,
      url: "https://panel.example/webhook",
      secret: "secret",
      fetchImpl,
      logger,
    });

    await outbox.start();
    await waitFor(() => fetchImpl.mock.calls.length === 1);
    await waitFor(
      async () =>
        (await fs.readdir(directory)).filter(file => file.endsWith(".json")).length === 0
    );
    await outbox.stop();

    expect(outbox.getStatus().pending).toBe(0);
    expect(outbox.getStatus().deadLetter).toBe(1);
    expect(await fs.readdir(deadLetter)).toEqual([
      "previous.permanent_webhook_failure.json",
    ]);
  });
});
