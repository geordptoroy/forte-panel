import { describe, expect, it } from "vitest";
import { contacts, formatCurrency, getContact, messagesByContact, quotes, stageOrder } from "../client/src/lib/demoData";

describe("demoData", () => {
  it("exposes the complete kanban stage order", () => {
    expect(stageOrder).toHaveLength(11);
    expect(stageOrder[0]).toBe("Novo contato");
    expect(stageOrder.at(-1)).toBe("Perdido");
  });

  it("finds a demo contact and keeps conversation data linked", () => {
    const contact = getContact("c1");
    expect(contact.name).toBe("Juliana Alves");
    expect(contact.stage).toBe("Triagem");
    expect(messagesByContact[contact.id]).toHaveLength(4);
  });

  it("formats Brazilian currency consistently", () => {
    expect(formatCurrency(1840)).toBe("R$ 1.840,00");
    expect(formatCurrency(0)).toBe("R$ 0,00");
  });

  it("keeps the demo billing totals internally consistent", () => {
    const quoted = quotes.reduce((total, quote) => total + quote.quoted, 0);
    const received = quotes.reduce((total, quote) => total + quote.received, 0);
    expect(contacts).toHaveLength(5);
    expect(quoted).toBe(2280);
    expect(received).toBe(280);
    expect(quoted - received).toBe(2000);
  });
});
