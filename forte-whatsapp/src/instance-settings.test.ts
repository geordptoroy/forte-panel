import { describe, expect, it } from "vitest";
import {
  DEFAULT_BAILEYS_INSTANCE_SETTINGS,
  normalizeBaileysInstanceSettings,
  parseBaileysInstanceSettings,
  shouldIgnoreInboundJid,
  shouldRejectIncomingCall,
} from "./instance-settings.js";

describe("Baileys per-instance settings", () => {
  it("preserves current behavior for legacy sessions", () => {
    expect(normalizeBaileysInstanceSettings(undefined)).toEqual(
      DEFAULT_BAILEYS_INSTANCE_SETTINGS
    );
    expect(normalizeBaileysInstanceSettings({ rejectCalls: true })).toEqual({
      ...DEFAULT_BAILEYS_INSTANCE_SETTINGS,
      rejectCalls: true,
    });
  });

  it("requires all settings to be explicit booleans when updating", () => {
    const valid = {
      rejectCalls: true,
      rejectGroups: false,
      logCalls: false,
      ignoreStatusUpdates: true,
    };
    expect(parseBaileysInstanceSettings(valid)).toEqual(valid);
    expect(() => parseBaileysInstanceSettings({ ...valid, rejectCalls: "yes" })).toThrow(
      "verdadeiro ou falso"
    );
    expect(() => parseBaileysInstanceSettings({ ...valid, extra: true })).toThrow(
      "verdadeiro ou falso"
    );
  });

  it("filters only selected group and Status broadcasts", () => {
    const defaults = { ...DEFAULT_BAILEYS_INSTANCE_SETTINGS };
    expect(shouldIgnoreInboundJid(defaults, "12345-678@g.us")).toBe(true);
    expect(shouldIgnoreInboundJid(defaults, "status@broadcast")).toBe(true);
    expect(shouldIgnoreInboundJid(defaults, "5511999999999@s.whatsapp.net")).toBe(
      false
    );
    expect(
      shouldIgnoreInboundJid({ ...defaults, rejectGroups: false }, "12345@g.us")
    ).toBe(false);
    expect(
      shouldIgnoreInboundJid(
        { ...defaults, ignoreStatusUpdates: false },
        "status@broadcast"
      )
    ).toBe(false);
  });

  it("rejects only incoming call offers when the instance option is enabled", () => {
    const rejectCalls = { ...DEFAULT_BAILEYS_INSTANCE_SETTINGS, rejectCalls: true };
    expect(shouldRejectIncomingCall(rejectCalls, "offer")).toBe(true);
    expect(shouldRejectIncomingCall(rejectCalls, "terminate")).toBe(false);
    expect(shouldRejectIncomingCall(DEFAULT_BAILEYS_INSTANCE_SETTINGS, "offer")).toBe(
      false
    );
  });
});
