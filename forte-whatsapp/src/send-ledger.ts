import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type LedgerEntry = {
  idempotencyKey: string;
  fingerprint: string;
  state: "started" | "completed";
  externalId?: string;
  updatedAt: string;
};

export class SendLedgerError extends Error {
  constructor(
    public readonly code: "idempotency_conflict" | "idempotency_in_progress",
    message: string
  ) {
    super(message);
    this.name = "SendLedgerError";
  }
}

export class SendLedger {
  private readonly active = new Map<string, Promise<string>>();

  constructor(private readonly directory: string) {}

  async execute(
    idempotencyKey: string,
    fingerprint: string,
    send: () => Promise<string>
  ): Promise<string> {
    const normalizedKey = idempotencyKey.trim();
    if (!normalizedKey) throw new Error("idempotency_key_required");
    const file = this.fileFor(normalizedKey);
    const existing = await this.read(file);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new SendLedgerError(
          "idempotency_conflict",
          "A chave de idempotência já foi usada com outro payload"
        );
      if (existing.state === "completed" && existing.externalId)
        return existing.externalId;
      throw new SendLedgerError(
        "idempotency_in_progress",
        "O envio anterior permanece inconclusivo; não será reenviado automaticamente"
      );
    }

    const running = this.active.get(normalizedKey);
    if (running) return running;
    const operation = this.start(file, normalizedKey, fingerprint, send);
    this.active.set(normalizedKey, operation);
    try {
      return await operation;
    } finally {
      this.active.delete(normalizedKey);
    }
  }

  private async start(
    file: string,
    idempotencyKey: string,
    fingerprint: string,
    send: () => Promise<string>
  ) {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const started: LedgerEntry = {
      idempotencyKey,
      fingerprint,
      state: "started",
      updatedAt: new Date().toISOString(),
    };
    await writeAtomic(file, started);
    let externalId: string;
    try {
      externalId = await send();
    } catch (error) {
      // Keep the started record. An unknown provider outcome must fail closed
      // instead of sending the same WhatsApp message again after a restart.
      throw error;
    }
    await writeAtomic(file, {
      ...started,
      state: "completed",
      externalId,
      updatedAt: new Date().toISOString(),
    } satisfies LedgerEntry);
    return externalId;
  }

  private fileFor(key: string) {
    const digest = crypto.createHash("sha256").update(key).digest("hex");
    return path.join(this.directory, `${digest}.json`);
  }

  private async read(file: string): Promise<LedgerEntry | undefined> {
    try {
      const value = JSON.parse(await fs.readFile(file, "utf8")) as LedgerEntry;
      if (
        typeof value.idempotencyKey !== "string" ||
        typeof value.fingerprint !== "string" ||
        !["started", "completed"].includes(value.state) ||
        (value.state === "completed" && typeof value.externalId !== "string")
      )
        throw new Error("invalid ledger entry");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error("idempotency_ledger_unavailable", { cause: error });
    }
  }
}

export function stableFingerprint(value: unknown) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)])
  );
}

async function writeAtomic(file: string, value: LedgerEntry) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await fs.rename(temporary, file);
}
