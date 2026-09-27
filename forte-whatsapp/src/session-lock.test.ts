import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireSessionLock } from "./session-lock.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map(directory =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

async function createSessionDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forte-session-lock-"));
  temporaryPaths.push(directory);
  return directory;
}

describe("Baileys session lock", () => {
  it("allows only one owner and releases atomically", async () => {
    const directory = await createSessionDirectory();
    const first = await acquireSessionLock(directory);

    await expect(acquireSessionLock(directory)).rejects.toThrow(
      "já está em uso"
    );
    await expect(fs.access(first.lockPath)).resolves.toBeUndefined();

    await first.release();
    await expect(fs.access(first.lockPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    const second = await acquireSessionLock(directory);
    await second.release();
  });

  it("reclaims a lock whose process no longer exists", async () => {
    const directory = await createSessionDirectory();
    const lockPath = path.join(directory, ".session.lock");
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid: 2_147_483_647, acquiredAt: new Date().toISOString() }),
      { mode: 0o600 }
    );

    const lock = await acquireSessionLock(directory);
    await expect(fs.readFile(lock.lockPath, "utf8")).resolves.toContain(
      `"pid":${process.pid}`
    );
    await lock.release();
  });

  it("keeps the session directory and lock private", async () => {
    const directory = await createSessionDirectory();
    const lock = await acquireSessionLock(directory);
    const directoryMode = (await fs.stat(directory)).mode & 0o777;
    const lockMode = (await fs.stat(lock.lockPath)).mode & 0o777;
    expect(directoryMode).toBe(0o700);
    expect(lockMode).toBe(0o600);
    await lock.release();
  });
});
