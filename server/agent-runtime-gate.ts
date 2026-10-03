export type AgentRuntimeGateConfig = {
  enabled: boolean;
  killSwitch?: {
    paused: boolean;
    reason: string | null;
  };
};

export type AgentRuntimeGateDecision =
  | { action: "execute" }
  | { action: "requeue"; reason: string }
  | { action: "deliver"; reason: "native_agent_disabled" };

export function sanitizeAgentPauseReason(reason: string | null | undefined) {
  const normalized = (reason ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return normalized || "manual";
}

export function decideAgentRuntimeGate(
  config: AgentRuntimeGateConfig
): AgentRuntimeGateDecision {
  if (config.killSwitch?.paused) {
    return {
      action: "requeue",
      reason: sanitizeAgentPauseReason(config.killSwitch.reason),
    };
  }
  if (!config.enabled) return { action: "deliver", reason: "native_agent_disabled" };
  return { action: "execute" };
}
