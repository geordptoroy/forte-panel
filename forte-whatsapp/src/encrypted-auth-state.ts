import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { proto, type AuthenticationState, type AuthenticationCreds } from "baileys";
import { BufferJSON, initAuthCreds } from "baileys";

const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const fileQueues = new Map<string, Promise<void>>();

type EncryptedAuthState = {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
};

function parseKey(value: string): Buffer {
  const trimmed = value.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== KEY_BYTES)
    throw new Error("WHATSAPP_SESSION_ENCRYPTION_KEY deve ter 32 bytes em hex ou base64");
  return key;
}

export function validateSessionEncryptionKey(value: string) {
  parseKey(value);
  return value.trim();
}

function encrypt(value: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

function decrypt(payload: string, key: Buffer): string {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = payload.split(":");
  if (version !== VERSION || !ivEncoded || !tagEncoded || !ciphertextEncoded)
    throw new Error("Formato de sessão Baileys criptografada inválido");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivEncoded, "base64"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function withFileQueue<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = fileQueues.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => (release = resolve));
  fileQueues.set(filePath, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (fileQueues.get(filePath) === current) fileQueues.delete(filePath);
  }
}

function fixFileName(file: string) {
  return file.replace(/\//g, "__").replace(/:/g, "-");
}

export async function useEncryptedAuthState(
  folder: string,
  encryptionKey: string
): Promise<EncryptedAuthState> {
  const key = parseKey(encryptionKey);
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  await fs.chmod(folder, 0o700);

  const filePath = (file: string) => path.join(folder, fixFileName(file));
  const persist = async (target: string, payload: string) => {
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, payload, { mode: 0o600 });
    await fs.chmod(temporary, 0o600);
    await fs.rename(temporary, target);
    await fs.chmod(target, 0o600);
  };
  const readData = async (file: string) => {
    const target = filePath(file);
    try {
      return await withFileQueue(target, async () => {
        const payload = await fs.readFile(target, "utf8");
        const encrypted = payload.startsWith(`${VERSION}:`);
        const value = JSON.parse(
          encrypted ? decrypt(payload, key) : payload,
          BufferJSON.reviver
        ) as unknown;
        if (!encrypted)
          await persist(target, encrypt(JSON.stringify(value, BufferJSON.replacer), key));
        return value;
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  const writeData = async (data: unknown, file: string) => {
    const target = filePath(file);
    await withFileQueue(target, async () => {
      const payload = encrypt(JSON.stringify(data, BufferJSON.replacer), key);
      await persist(target, payload);
    });
  };
  const removeData = async (file: string) => {
    const target = filePath(file);
    await withFileQueue(target, async () => {
      try {
        await fs.unlink(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    });
  };

  const creds = (await readData("creds.json")) as AuthenticationCreds | null ?? initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: Record<string, unknown> = {};
          await Promise.all(ids.map(async id => {
            let value = await readData(`${type}-${id}.json`);
            if (type === "app-state-sync-key" && value)
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            data[id] = value;
          }));
          return data as never;
        },
        set: async values => {
          await Promise.all(Object.entries(values).flatMap(([category, entries]) =>
            Object.entries(entries).map(([id, value]) =>
              value
                ? writeData(value, `${category}-${id}.json`)
                : removeData(`${category}-${id}.json`)
            )
          ));
        },
      },
    },
    saveCreds: () => writeData(creds, "creds.json"),
  };
}
