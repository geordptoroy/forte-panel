import { describe, expect, it } from "vitest";
import { nativeAgentTools } from "./native-agent";

describe("native agent commercial context", () => {
  it("exposes a read-only context tool without model-controlled identifiers", () => {
    const tool = nativeAgentTools.find(item => item.function.name === "consultar_contexto_comercial");
    expect(tool).toBeDefined();
    expect(tool?.function.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {},
    });
    expect(JSON.stringify(tool)).not.toContain("workspaceId");
  });
});
