import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import {
  DEFAULT_BAILEYS_INSTANCE_SETTINGS,
  normalizeBaileysInstanceSettings,
  parseBaileysInstanceSettings,
  type BaileysInstanceSettings,
} from "./instance-settings.js";
import { InstanceManager, type InstanceSnapshot } from "./instance-manager.js";

type InstanceRecord = {
  instanceId: string;
  name: string;
  autoStart: boolean;
  settings: BaileysInstanceSettings;
};

type RegistryEntry = {
  record: InstanceRecord;
  manager: InstanceManager;
};

type InstanceManagerFactory = (
  instanceId: string,
  name: string,
  settings: BaileysInstanceSettings
) => InstanceManager;

type InstanceRegistryOptions = {
  sessionDir?: string;
  defaultInstanceId?: string;
  defaultInstanceName?: string;
  maxInstances?: number;
  managerFactory?: InstanceManagerFactory;
};

const instanceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;

export function validateInstanceId(instanceId: string) {
  return (
    instanceIdPattern.test(instanceId) &&
    instanceId !== "." &&
    instanceId !== ".." &&
    !instanceId.includes("..")
  );
}

function validateName(name: string) {
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 120)
    throw new Error("O nome da instância deve ter entre 2 e 120 caracteres");
  return normalized;
}

export class InstanceRegistry {
  private readonly instances = new Map<string, RegistryEntry>();
  private readonly sessionDir: string;
  private readonly defaultInstanceId: string;
  private readonly defaultInstanceName: string;
  private readonly maxInstances: number;
  private readonly managerFactory: InstanceManagerFactory;

  constructor(options: InstanceRegistryOptions = {}) {
    this.sessionDir = path.resolve(options.sessionDir ?? config.sessionDir);
    this.defaultInstanceId = options.defaultInstanceId ?? config.instanceId;
    this.defaultInstanceName = options.defaultInstanceName ?? config.instanceName;
    this.maxInstances = options.maxInstances ?? config.maxInstances;
    this.managerFactory =
      options.managerFactory ??
      ((instanceId, name, settings) => new InstanceManager(instanceId, name, settings));
    if (!validateInstanceId(this.defaultInstanceId))
      throw new Error("WHATSAPP_INSTANCE_ID inválido");
  }

  async initialize() {
    await fs.mkdir(this.sessionDir, { recursive: true, mode: 0o700 });
    const entries = await fs.readdir(this.sessionDir, { withFileTypes: true });
    const instanceIds = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(instanceId => {
        const directory = path.resolve(this.sessionDir, instanceId);
        return (
          validateInstanceId(instanceId) &&
          directory !== path.resolve(config.webhookOutboxDir)
        );
      });
    for (const instanceId of Array.from(new Set(instanceIds))) {
      const directory = this.directoryFor(instanceId);
      const record = await this.readRecord(directory, instanceId);
      this.instances.set(instanceId, {
        record,
        manager: this.managerFactory(instanceId, record.name, record.settings),
      });
      await this.writeRecord(record);
    }

    for (const { record, manager } of this.instances.values()) {
      if (!record.autoStart) continue;
      await manager.start().catch(error => {
        console.error(
          `[forte-whatsapp] could not resume instance ${record.instanceId}:`,
          error instanceof Error ? error.message : error
        );
      });
    }
  }

  list(): InstanceSnapshot[] {
    return Array.from(this.instances.values(), entry => entry.manager.getStatus());
  }

  get(instanceId: string) {
    return this.instances.get(instanceId)?.manager;
  }

  async create(instanceId: string, name: string) {
    if (!validateInstanceId(instanceId))
      throw new Error("ID da instância inválido");
    if (this.instances.has(instanceId))
      throw new Error("Já existe uma instância com este ID");
    if (this.instances.size >= this.maxInstances)
      throw new Error(`Limite de ${this.maxInstances} instâncias atingido`);
    const directory = this.directoryFor(instanceId);
    try {
      await fs.access(directory);
      throw new Error("Já existe uma sessão persistida com este ID");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const record: InstanceRecord = {
      instanceId,
      name: validateName(name),
      autoStart: false,
      settings: { ...DEFAULT_BAILEYS_INSTANCE_SETTINGS },
    };
    const manager = this.managerFactory(instanceId, record.name, record.settings);
    await this.writeRecord(record);
    this.instances.set(instanceId, { record, manager });
    return manager.getStatus();
  }

  async rename(instanceId: string, name: string) {
    const entry = this.requireEntry(instanceId);
    const updated = { ...entry.record, name: validateName(name) };
    await this.writeRecord(updated);
    entry.record = updated;
    entry.manager.setName(updated.name);
    return entry.manager.getStatus();
  }

  async updateSettings(instanceId: string, settings: unknown) {
    const entry = this.requireEntry(instanceId);
    const normalized = parseBaileysInstanceSettings(settings);
    const updated = { ...entry.record, settings: normalized };
    await this.writeRecord(updated);
    entry.record = updated;
    entry.manager.setSettings(normalized);
    return entry.manager.getStatus();
  }

  async connect(instanceId: string) {
    const entry = this.requireEntry(instanceId);
    await this.setAutoStart(entry, true);
    await entry.manager.reconnect();
    return entry.manager.getStatus();
  }

  async requestPairingCode(instanceId: string, phone: string) {
    const entry = this.requireEntry(instanceId);
    await this.setAutoStart(entry, true);
    const code = await entry.manager.requestPairingCode(phone);
    return { instanceId, code };
  }

  async disconnect(instanceId: string, logout = false) {
    const entry = this.requireEntry(instanceId);
    await this.setAutoStart(entry, false);
    await entry.manager.stop(logout);
    return entry.manager.getStatus();
  }

  async remove(instanceId: string) {
    const entry = this.requireEntry(instanceId);
    await entry.manager.deleteSession();
    this.instances.delete(instanceId);
    return { success: true, instanceId };
  }

  async qr(instanceId: string) {
    return this.requireEntry(instanceId).manager.getStatus().qr ?? null;
  }

  async profile(instanceId: string) {
    return this.requireEntry(instanceId).manager.getProfile();
  }

  async sendMessage(
    instanceId: string,
    phone: string,
    messageType: string,
    content: string,
    metadata: Record<string, unknown> = {},
    idempotencyKey?: string
  ) {
    return this.requireEntry(instanceId).manager.sendMessage(
      phone,
      messageType,
      content,
      metadata,
      idempotencyKey
    );
  }

  async sendPayload(
    instanceId: string,
    phone: string,
    payload: Parameters<InstanceManager["sendPayload"]>[1],
    idempotencyKey?: string
  ) {
    return this.requireEntry(instanceId).manager.sendPayload(phone, payload, idempotencyKey);
  }

  async stopAll() {
    await Promise.all(
      Array.from(this.instances.values(), ({ manager }) =>
        manager.stop(false).catch(error =>
          console.error("[forte-whatsapp] failed to stop instance:", error)
        )
      )
    );
  }

  private requireEntry(instanceId: string) {
    const entry = this.instances.get(instanceId);
    if (!entry) throw new Error("Instância Baileys não encontrada");
    return entry;
  }

  private async setAutoStart(entry: RegistryEntry, autoStart: boolean) {
    const updated = { ...entry.record, autoStart };
    await this.writeRecord(updated);
    entry.record = updated;
  }

  private directoryFor(instanceId: string) {
    if (!validateInstanceId(instanceId))
      throw new Error("ID da instância inválido");
    return path.join(this.sessionDir, instanceId);
  }

  private async readRecord(
    directory: string,
    instanceId: string
  ): Promise<InstanceRecord> {
    const file = path.join(directory, ".instance.json");
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Partial<InstanceRecord>;
      if (
        parsed.instanceId === instanceId &&
        typeof parsed.name === "string" &&
        typeof parsed.autoStart === "boolean"
      )
        return {
          instanceId,
          name: validateName(parsed.name),
          autoStart: parsed.autoStart,
          settings: normalizeBaileysInstanceSettings(parsed.settings),
        };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.warn(
          `[forte-whatsapp] invalid instance metadata for ${instanceId}; preserving directory and using legacy defaults`
        );
    }
    return {
      instanceId,
      name:
        instanceId === this.defaultInstanceId
          ? this.defaultInstanceName
          : `WhatsApp · ${instanceId}`,
      settings: { ...DEFAULT_BAILEYS_INSTANCE_SETTINGS },
      // Existing folders without a marker are legacy sessions and must resume.
      autoStart: true,
    };
  }

  private async writeRecord(record: InstanceRecord) {
    const directory = this.directoryFor(record.instanceId);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const target = path.join(directory, ".instance.json");
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await fs.chmod(temporary, 0o600);
    await fs.rename(temporary, target);
    await fs.chmod(target, 0o600);
  }
}
