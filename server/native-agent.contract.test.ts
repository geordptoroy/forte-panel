import { describe, expect, it } from "vitest";
import {
  nativeAgentMutatingToolNames,
  nativeAgentTools,
} from "./native-agent";

describe("native agent commercial context contract", () => {
  it("exposes a read-only commercial context without model-supplied IDs", () => {
    const contextTool = nativeAgentTools.find(
      tool => tool.function.name === "consultar_contexto_comercial"
    );
    expect(contextTool).toBeDefined();
    expect(contextTool?.function.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {},
    });
    expect(nativeAgentMutatingToolNames.has("consultar_contexto_comercial")).toBe(
      false
    );
  });

  it("keeps mutating tools explicit", () => {
    expect(nativeAgentMutatingToolNames).toEqual(
      new Set([
        "atualizar_lead",
        "registrar_nota",
        "criar_agendamento",
        "transferir_humano",
      ])
    );
  });
});
