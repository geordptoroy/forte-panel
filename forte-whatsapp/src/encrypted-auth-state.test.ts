import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  useEncryptedAuthState,
  validateSessionEncryptionKey,
} from "./encrypted-auth-state.js";

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map(directory =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

async function createFolder() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "forte-encrypted-auth-"));
  temporaryPaths.push(folder);
  return folder;
}

const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encrypted Baileys auth state", () => {
  it("accepts exactly 32-byte hex/base64 keys and rejects other lengths", () => {
    expect(validateSessionEncryptionKey(key)).toBe(key);
    expect(validateSessionEncryptionKey(Buffer.alloc(32, 7).toString("base64"))).toBe(
      Buffer.alloc(32, 7).toString("base64")
    );
    expect(() => validateSessionEncryptionKey("too-short")).toThrow();
  });

  it("persists credentials and signal keys encrypted, then restores them", async () => {
    const folder = await createFolder();
    const first = await useEncryptedAuthState(folder, key);
    first.state.creds.myAppStateKeyId = "private-marker";
    await first.saveCreds();
    await first.state.keys.set({
      "pre-key": {
        "1": { private: Buffer.from("private-key"), public: Buffer.from("public-key") },
      },
    } as never);

    const credsFile = await fs.readFile(path.join(folder, "creds.json"), "utf8");
    const keyFile = await fs.readFile(path.join(folder, "pre-key-1.json"), "utf8");
    expect(credsFile).not.toContain("private-marker");
    expect(keyFile).not.toContain("private-key");

    const restored = await useEncryptedAuthState(folder, key);
    expect(restored.state.creds.myAppStateKeyId).toBe("private-marker");
    const keys = await restored.state.keys.get("pre-key", ["1"]);
    expect((keys["1"] as unknown as { private: Buffer }).private).toEqual(
      Buffer.from("private-key")
    );
  });

  it("rejects a wrong key instead of silently starting a new session", async () => {
    const folder = await createFolder();
    const first = await useEncryptedAuthState(folder, key);
    await first.saveCreds();
    await expect(
      useEncryptedAuthState(folder, "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd")
    ).rejects.toThrow();
  });

  it("migrates a legacy plaintext credentials file on first encrypted read", async () => {
    const folder = await createFolder();
    await fs.writeFile(
      path.join(folder, "creds.json"),
      JSON.stringify({ myAppStateKeyId: "legacy-marker" }),
      { mode: 0o600 }
    );

    const restored = await useEncryptedAuthState(folder, key);
    expect(restored.state.creds.myAppStateKeyId).toBe("legacy-marker");
    await expect(fs.readFile(path.join(folder, "creds.json"), "utf8")).resolves.toMatch(/^v1:/);
  });
});
