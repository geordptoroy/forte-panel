import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { InstanceRegistry as RegistryType } from "./instance-registry.js";
import type { InstanceManager, InstanceSnapshot } from "./instance-manager.js";
import {
  DEFAULT_BAILEYS_INSTANCE_SETTINGS,
  type BaileysInstanceSettings,
} from "./instance-settings.js";

const roots: string[] = [];
let InstanceRegistryClass: typeof import("./instance-registry.js").InstanceRegistry;

beforeAll(async () => {
  process.env.WHATSAPP_API_KEY ??= "registry-test-key";
  ({ InstanceRegistry: InstanceRegistryClass } = await import("./instance-registry.js"));
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

async function makeRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "forte-instance-registry-"));
  roots.push(root);
  return root;
}

function managerFactory(sessionDir: string) {
  const managers = new Map<string, FakeManager>();
  const factory = (
    instanceId: string,
    name: string,
    settings: BaileysInstanceSettings = DEFAULT_BAILEYS_INSTANCE_SETTINGS
  ) => {
    const manager = new FakeManager(instanceId, name, sessionDir, settings);
    managers.set(instanceId, manager);
    return manager as unknown as InstanceManager;
  };
  return { factory, managers };
}

class FakeManager {
  status: InstanceSnapshot["status"] = "idle";
  starts = 0;
  settings: BaileysInstanceSettings = { ...DEFAULT_BAILEYS_INSTANCE_SETTINGS };

  constructor(
    readonly instanceId: string,
    private name: string,
    private readonly sessionDir: string,
    settings: BaileysInstanceSettings = DEFAULT_BAILEYS_INSTANCE_SETTINGS
  ) {
    this.settings = { ...settings };
  }

  getStatus(): InstanceSnapshot {
    return {
      instanceId: this.instanceId,
      instanceName: this.name,
      status: this.status,
      settings: { ...this.settings },
      updatedAt: new Date(0).toISOString(),
    };
  }

  setSettings(settings: BaileysInstanceSettings) {
    this.settings = { ...settings };
  }

  setName(name: string) {
    this.name = name;
  }

  async start() {
    this.starts += 1;
    this.status = "connected";
  }

  async reconnect() {
    this.status = "qr";
  }

  async stop(logout = false) {
    this.status = logout ? "logged_out" : "disconnected";
  }

  async deleteSession() {
    this.status = "logged_out";
    await fs.rm(path.join(this.sessionDir, this.instanceId), {
      recursive: true,
      force: true,
    });
  }

  async requestPairingCode() {
    return "AB12-CD34";
  }

  async sendMessage() {
    return "message-id";
  }

  async sendPayload() {
    return "message-id";
  }
}

describe("Baileys InstanceRegistry lifecycle", () => {
  it("creates, renames, persists and removes a stable instance without recreating the default", async () => {
    const sessionDir = await makeRoot();
    const { factory, managers } = managerFactory(sessionDir);
    const options = {
      sessionDir,
      defaultInstanceId: "default",
      defaultInstanceName: "Legacy",
      managerFactory: factory,
    };
    const registry = new InstanceRegistryClass(options);
    await registry.initialize();
    expect(registry.list()).toEqual([]);

    const created = await registry.create("ws3-sales", "Vendas");
    expect(created).toMatchObject({ instanceId: "ws3-sales", instanceName: "Vendas", status: "idle" });
    expect(await fs.readFile(path.join(sessionDir, "ws3-sales", ".instance.json"), "utf8")).toContain('"autoStart":false');
    const settings = {
      ...DEFAULT_BAILEYS_INSTANCE_SETTINGS,
      rejectCalls: true,
      rejectGroups: false,
    };
    expect(await registry.updateSettings("ws3-sales", settings)).toMatchObject({
      settings,
    });

    const renamed = await registry.rename("ws3-sales", "Atendimento");
    expect(renamed.instanceName).toBe("Atendimento");
    await registry.connect("ws3-sales");
    expect(registry.get("ws3-sales")?.getStatus().status).toBe("qr");

    const restoredManagers = managerFactory(sessionDir);
    const restored = new InstanceRegistryClass({ ...options, managerFactory: restoredManagers.factory });
    await restored.initialize();
    expect(restored.list()).toEqual([
      expect.objectContaining({
        instanceId: "ws3-sales",
        instanceName: "Atendimento",
        status: "connected",
        settings,
      }),
    ]);
    expect(restoredManagers.managers.get("ws3-sales")?.starts).toBe(1);

    await restored.remove("ws3-sales");
    expect(restored.list()).toEqual([]);
    expect(managers.get("ws3-sales")).toBeDefined();

    const afterDelete = new InstanceRegistryClass({
      ...options,
      managerFactory: managerFactory(sessionDir).factory,
    });
    await afterDelete.initialize();
    expect(afterDelete.list()).toEqual([]);
    expect(afterDelete.get("default")).toBeUndefined();
  });

  it("rejects unsafe IDs, invalid names and instances beyond the configured limit", async () => {
    const sessionDir = await makeRoot();
    const { factory } = managerFactory(sessionDir);
    const registry: RegistryType = new InstanceRegistryClass({
      sessionDir,
      maxInstances: 1,
      managerFactory: factory,
    });
    await registry.initialize();
    await expect(registry.create("../escape", "Inválida")).rejects.toThrow("ID da instância inválido");
    await expect(registry.create("ws3-one", "x")).rejects.toThrow("2 e 120");
    await registry.create("ws3-one", "Vendas");
    await expect(registry.create("ws3-two", "Suporte")).rejects.toThrow("Limite de 1 instâncias");
  });
});
