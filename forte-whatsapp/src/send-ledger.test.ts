import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SendLedger, stableFingerprint } from "./send-ledger.js";

describe("durable outbound send ledger", () => {
  it("reuses a completed external id without calling the provider twice", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forte-send-ledger-"));
    const first = new SendLedger(directory);
    const provider = async () => "provider-message-1";
    await expect(first.execute("message-key-1", "payload-1", provider)).resolves.toBe(
      "provider-message-1"
    );

    const afterRestart = new SendLedger(directory);
    const replay = vi.fn(provider);
    await expect(afterRestart.execute("message-key-1", "payload-1", replay)).resolves.toBe(
      "provider-message-1"
    );
    expect(replay).not.toHaveBeenCalled();
  });

  it("rejects the same key with a different payload", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forte-send-ledger-"));
    const ledger = new SendLedger(directory);
    await ledger.execute("message-key-2", stableFingerprint({ text: "one" }), async () => "id-2");

    await expect(
      ledger.execute("message-key-2", stableFingerprint({ text: "two" }), async () => "id-3")
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("keeps an unknown provider outcome in progress after restart", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forte-send-ledger-"));
    const ledger = new SendLedger(directory);
    await expect(
      ledger.execute("message-key-3", "payload-3", async () => {
        throw new Error("provider timeout after acceptance");
      })
    ).rejects.toThrow("provider timeout after acceptance");

    const afterRestart = new SendLedger(directory);
    const provider = vi.fn(async () => "duplicate-must-not-happen");
    await expect(
      afterRestart.execute("message-key-3", "payload-3", provider)
    ).rejects.toMatchObject({ code: "idempotency_in_progress" });
    expect(provider).not.toHaveBeenCalled();
  });
});
