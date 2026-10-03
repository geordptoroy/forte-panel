import { describe, expect, it } from "vitest";
import { capabilityForMessageType } from "./llm-providers";
import {
  decideAgentRuntimeGate,
  sanitizeAgentPauseReason,
} from "./agent-runtime-gate";

describe("native agent runtime gate", () => {
  it.each([
    ["text", undefined, "text"],
    ["audio", "audio", "audio"],
    ["image", "vision", "vision"],
    ["document", "document", "document"],
  ])("maps %s to the expected provider capability", (messageType, _label, expected) => {
    expect(capabilityForMessageType(messageType)).toBe(expected);
  });

  it("requeues every capability while the tenant kill switch is paused", () => {
    expect(
      decideAgentRuntimeGate({
        enabled: false,
        killSwitch: { paused: true, reason: "pausa operacional" },
      })
    ).toEqual({ action: "requeue", reason: "pausa operacional" });
  });

  it("never lets a paused configuration reach execute", () => {
    expect(
      decideAgentRuntimeGate({
        enabled: true,
        killSwitch: { paused: true, reason: "manual" },
      }).action
    ).toBe("requeue");
    expect(decideAgentRuntimeGate({ enabled: false }).action).toBe("deliver");
    expect(decideAgentRuntimeGate({ enabled: true }).action).toBe("execute");
  });

  it("sanitizes control characters and bounds the persisted reason", () => {
    const reason = sanitizeAgentPauseReason("  pausa\noperacional\u0000" + "x".repeat(400));
    expect(reason.startsWith("pausa operacional ")).toBe(true);
    expect(reason.length).toBe(240);
    expect(reason).not.toMatch(/[\u0000-\u001f\u007f]/);
  });
});
