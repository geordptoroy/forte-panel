import { afterEach, describe, expect, it } from "vitest";
import {
  buildLocalSimulationResponse,
  canPlatformAdminMutate,
  configuredPlatformAdminOpenIds,
  isExternalProviderCallAllowedForSimulation,
  validateAgentPromptInput,
} from "./platform-admin";

describe("platform admin safety boundaries", () => {
  const previous = process.env.PLATFORM_ADMIN_OPEN_IDS;

  afterEach(() => {
    if (previous === undefined) delete process.env.PLATFORM_ADMIN_OPEN_IDS;
    else process.env.PLATFORM_ADMIN_OPEN_IDS = previous;
  });

  it("never grants write access to readonly support", () => {
    expect(
      canPlatformAdminMutate("platform_support_readonly", "read_only")
    ).toBe(false);
    expect(
      canPlatformAdminMutate("platform_support_readonly", "operator")
    ).toBe(false);
    expect(
      canPlatformAdminMutate("platform_support_operator", "read_only")
    ).toBe(false);
    expect(
      canPlatformAdminMutate("platform_support_operator", "operator")
    ).toBe(true);
    expect(canPlatformAdminMutate("platform_admin", "operator")).toBe(true);
  });

  it("uses explicit open id configuration and does not infer from users.role", () => {
    process.env.PLATFORM_ADMIN_OPEN_IDS = " user-a, user-b, user-a ";
    expect([...configuredPlatformAdminOpenIds()]).toEqual(["user-a", "user-b"]);
  });

  it("rejects credentials in an agent prompt", () => {
    expect(
      validateAgentPromptInput({
        model: "gpt-5-mini",
        systemPrompt: "Use api_key=sk-this-is-not-a-prompt-secret",
      }).valid
    ).toBe(false);
    expect(
      validateAgentPromptInput({
        model: "gpt-5-mini",
        systemPrompt: "Use Bearer abcdefghijklmnop",
      }).valid
    ).toBe(false);
    expect(
      validateAgentPromptInput({
        model: "gpt-5-mini",
        systemPrompt: "Responda com clareza e nunca invente disponibilidade.",
      }).valid
    ).toBe(true);
  });

  it("runs a deterministic local simulation without an external provider", () => {
    const output = buildLocalSimulationResponse({
      workspaceName: "Demo Beta",
      prompt: "Tom cordial",
      message: "  Quero   um orçamento  ",
    });
    expect(output).toContain("Demo Beta");
    expect(output).toContain("Quero um orçamento");
    expect(isExternalProviderCallAllowedForSimulation()).toBe(false);
  });
});
