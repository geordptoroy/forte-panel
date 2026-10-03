import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type WebhookOutboxPayload = Record<string, unknown>;

type OutboxEnvelope = {
  payload: WebhookOutboxPayload;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  createdAt: string;
};

type WebhookOutboxOptions = {
  directory: string;
  url: string;
  secret: string;
  maxAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  fetchImpl?: typeof fetch;
  logger?: {
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    info: (...args: any[]) => void;
  };
};

const isEnvelope = (value: unknown): value is OutboxEnvelope => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<OutboxEnvelope>;
  return Boolean(
    item.payload &&
      typeof item.payload === "object" &&
      typeof item.attempts === "number" &&
      typeof item.nextAttemptAt === "string" &&
      typeof item.createdAt === "string"
  );
};

export class WebhookOutbox {
  private readonly directory: string;
  private readonly url: string;
  private secret: string;
  private readonly maxAttempts: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: NonNullable<WebhookOutboxOptions["logger"]>;
  private readonly inFlight = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private flushPromise?: Promise<void>;
  private flushRequested = false;
  private pending = 0;
  private deadLetter = 0;
  private lastError?: string;

  constructor(options: WebhookOutboxOptions) {
    this.directory = options.directory;
    this.url = options.url;
    this.secret = options.secret;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 8);
    this.initialBackoffMs = Math.max(50, options.initialBackoffMs ?? 1_000);
    this.maxBackoffMs = Math.max(this.initialBackoffMs, options.maxBackoffMs ?? 60_000);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger ?? console;
  }

  getStatus() {
    return {
      pending: this.pending,
      deadLetter: this.deadLetter,
      lastError: this.lastError,
    };
  }

  setSecret(secret: string) {
    const normalized = secret.trim();
    if (normalized.length < 32 || normalized.length > 256)
      throw new Error("webhook_secret_length_invalid");
    this.secret = normalized;
  }

  async start() {
    await fs.mkdir(this.directory, { recursive: true });
    await this.refreshPending();
    void this.flush().catch(error => {
      this.lastError = error instanceof Error ? error.message : "outbox_flush_failed";
      this.logger.error({ error }, "inbound webhook outbox flush failed");
    });
    this.timer ??= setInterval(
      () =>
        void this.flush().catch(error => {
          this.lastError = error instanceof Error ? error.message : "outbox_flush_failed";
          this.logger.error({ error }, "inbound webhook outbox flush failed");
        }),
      5_000
    );
    this.timer.unref?.();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.flushPromise;
  }

  async enqueue(payload: WebhookOutboxPayload) {
    if (!this.url) return;
    await fs.mkdir(this.directory, { recursive: true });
    const eventId = String(payload.eventId ?? crypto.randomUUID());
    const file = this.fileFor(eventId);
    try {
      await fs.access(file);
      return;
    } catch {
      // The event is new. The atomic rename below makes it survive a process crash.
    }
    const envelope: OutboxEnvelope = {
      payload: { ...payload, eventId },
      attempts: 0,
      nextAttemptAt: new Date(0).toISOString(),
      createdAt: new Date().toISOString(),
    };
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(envelope), { mode: 0o600 });
    try {
      // `rename` replaces an existing file. A concurrent enqueue for the same
      // event could therefore recreate an item after the first delivery
      // deleted it. A hard-link gives us an atomic create-if-absent operation.
      await fs.link(temporary, file);
    } catch (error) {
      if (
        !(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "EEXIST"
        )
      )
        throw error;
      return;
    } finally {
      await fs.rm(temporary, { force: true });
    }
    this.pending += 1;
    void this.flush().catch(error => {
      this.lastError = error instanceof Error ? error.message : "outbox_flush_failed";
      this.logger.error({ error }, "inbound webhook outbox flush failed");
    });
  }

  async flush() {
    if (this.flushPromise) {
      this.flushRequested = true;
      return this.flushPromise;
    }
    this.flushPromise = (async () => {
      do {
        this.flushRequested = false;
        await this.flushInternal();
      } while (this.flushRequested);
    })().finally(() => {
      this.flushPromise = undefined;
    });
    return this.flushPromise;
  }

  private async flushInternal() {
    if (!this.url) return;
    await fs.mkdir(this.directory, { recursive: true });
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
      .map(entry => path.join(this.directory, entry.name));
    this.pending = files.length;
    await Promise.all(files.map(file => this.deliver(file)));
    await this.refreshPending();
  }

  private async refreshPending() {
    try {
      const entries = await fs.readdir(this.directory, { withFileTypes: true });
      this.pending = entries.filter(
        entry => entry.isFile() && entry.name.endsWith(".json")
      ).length;
      try {
        const deadLetterEntries = await fs.readdir(
          path.join(this.directory, "dead-letter"),
          { withFileTypes: true }
        );
        this.deadLetter = deadLetterEntries.filter(
          entry => entry.isFile() && entry.name.endsWith(".json")
        ).length;
      } catch {
        this.deadLetter = 0;
      }
    } catch {
      this.pending = 0;
      this.deadLetter = 0;
    }
  }

  private fileFor(eventId: string) {
    const key = crypto.createHash("sha256").update(eventId).digest("hex");
    return path.join(this.directory, `${key}.json`);
  }

  private async deliver(file: string) {
    if (this.inFlight.has(file)) return;
    this.inFlight.add(file);
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isEnvelope(parsed)) {
        await this.quarantine(file, "invalid_outbox_envelope");
        return;
      }
      if (Date.parse(parsed.nextAttemptAt) > Date.now()) return;

      let envelope = parsed;
      for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
        try {
          const body = JSON.stringify(envelope.payload);
          const timestamp = String(Math.floor(Date.now() / 1000));
          const nonce = crypto.randomBytes(18).toString("base64url");
          const signature = `sha256=${crypto
            .createHmac("sha256", this.secret)
            .update(`${timestamp}.${nonce}.${body}`)
            .digest("hex")}`;
          const response = await this.fetchImpl(this.url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-webhook-secret": this.secret,
              "x-webhook-signature": signature,
              "x-webhook-timestamp": timestamp,
              "x-webhook-nonce": nonce,
              ...(typeof envelope.payload.instanceId === "string"
                ? { "x-webhook-instance-id": envelope.payload.instanceId }
                : {}),
            },
            body,
          });
          if (!response.ok)
            throw new Error(`webhook_http_${response.status}`);
          await fs.unlink(file);
          this.lastError = undefined;
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : "webhook_delivery_failed";
          envelope = {
            ...envelope,
            attempts: envelope.attempts + 1,
            lastError: message,
            nextAttemptAt: new Date(
              Date.now() + Math.min(this.maxBackoffMs, this.initialBackoffMs * 2 ** (attempt - 1))
            ).toISOString(),
          };
          this.lastError = message;
          if (isPermanentWebhookError(message)) {
            await this.quarantine(file, "permanent_webhook_failure", envelope);
            this.logger.warn(
              { file, attempts: envelope.attempts, error: message },
              "inbound webhook moved to dead letter"
            );
            return;
          }
          if (attempt < this.maxAttempts) {
            await sleep(Math.min(this.maxBackoffMs, this.initialBackoffMs * 2 ** (attempt - 1)));
            continue;
          }
          await writeJsonAtomically(file, envelope);
          this.logger.warn({ file, attempts: envelope.attempts, error: message }, "inbound webhook queued for retry");
        }
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return;
      this.lastError = error instanceof Error ? error.message : "outbox_read_failed";
      this.logger.error({ file, error }, "inbound webhook outbox item could not be processed");
    } finally {
      this.inFlight.delete(file);
    }
  }

  private async quarantine(
    file: string,
    reason: string,
    envelope?: OutboxEnvelope
  ) {
    if (envelope) {
      const directory = path.join(this.directory, "dead-letter");
      await fs.mkdir(directory, { recursive: true });
      const target = path.join(
        directory,
        `${path.basename(file, ".json")}.${reason}.json`
      );
      await writeJsonAtomically(target, {
        ...envelope,
        quarantinedAt: new Date().toISOString(),
        quarantineReason: reason,
      });
      await fs.unlink(file).catch(() => undefined);
      return;
    }
    const target = `${file}.${reason}.${Date.now()}`;
    await fs.rename(file, target).catch(() => undefined);
    this.logger.error({ file, reason }, "invalid inbound webhook outbox item quarantined");
  }
}

async function writeJsonAtomically(file: string, value: unknown) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await fs.rename(temporary, file);
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function isPermanentWebhookError(message: string) {
  const match = /^webhook_http_(\d{3})$/.exec(message);
  if (!match) return false;
  const status = Number(match[1]);
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
