import fs from "node:fs/promises";
import path from "node:path";

export type SessionLock = {
  lockPath: string;
  release: () => Promise<void>;
};

type LockRecord = {
  pid: number;
  acquiredAt: string;
};

export async function ensurePrivateSessionDirectory(sessionPath: string) {
  await fs.mkdir(sessionPath, { recursive: true, mode: 0o700 });
  await fs.chmod(sessionPath, 0o700);
  const entries = await fs.readdir(sessionPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(sessionPath, entry.name);
    if (entry.isDirectory()) {
      await ensurePrivateSessionDirectory(entryPath);
    } else if (!entry.isSymbolicLink()) {
      await fs.chmod(entryPath, 0o600);
    }
  }
}

function isProcessAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function acquireSessionLock(sessionPath: string): Promise<SessionLock> {
  await ensurePrivateSessionDirectory(sessionPath);
  const lockPath = path.join(sessionPath, ".session.lock");
  const record: LockRecord = {
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
  };

  try {
    const handle = await fs.open(lockPath, "wx", 0o600);
    await handle.writeFile(JSON.stringify(record));
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let existing: Partial<LockRecord> = {};
    try {
      existing = JSON.parse(await fs.readFile(lockPath, "utf8")) as Partial<LockRecord>;
    } catch {
      throw new Error("Sessão Baileys bloqueada por lock ilegível; remova o lock após confirmar que não há outro processo ativo");
    }
    if (isProcessAlive(Number(existing.pid))) {
      throw new Error(`Sessão Baileys já está em uso pelo processo ${existing.pid}`);
    }
    await fs.unlink(lockPath);
    return acquireSessionLock(sessionPath);
  }

  let released = false;
  return {
    lockPath,
    release: async () => {
      if (released) return;
      released = true;
      try {
        const current = JSON.parse(await fs.readFile(lockPath, "utf8")) as Partial<LockRecord>;
        if (Number(current.pid) === process.pid) await fs.unlink(lockPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
