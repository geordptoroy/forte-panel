import { describe, expect, it } from "vitest";
import {
  CONTACT_STAGE_ORDER,
  isContactStage,
} from "@shared/contact-stage";

describe("contact stage contract", () => {
  it("keeps one ordered canonical list for the funnel", () => {
    expect(CONTACT_STAGE_ORDER).toHaveLength(11);
    expect(CONTACT_STAGE_ORDER[0]).toBe("Novo contato");
    expect(CONTACT_STAGE_ORDER.at(-1)).toBe("Perdido");
    expect(new Set(CONTACT_STAGE_ORDER).size).toBe(CONTACT_STAGE_ORDER.length);
  });

  it("rejects arbitrary stage strings", () => {
    expect(isContactStage("Triagem")).toBe(true);
    expect(isContactStage("status-customizado")).toBe(false);
    expect(isContactStage("pago")).toBe(false);
  });
});
