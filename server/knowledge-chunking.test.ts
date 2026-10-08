import { describe, expect, it } from "vitest";
import { chunkKnowledgeText } from "./knowledge-chunking";

describe("knowledge chunking", () => {
  it("preserves headings and page markers", () => {
    const chunks = chunkKnowledgeText("# Cancelamento\n\n[p2]\nO cancelamento deve ser pedido com antecedência.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.heading).toBe("Cancelamento");
    expect(chunks[0]?.pageNumber).toBe(2);
    expect(chunks[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("splits long content deterministically with bounded chunks", () => {
    const source = Array.from({ length: 80 }, (_, index) => `Parágrafo ${index} com informação de negócio.`).join("\n");
    const first = chunkKnowledgeText(source, { maxChars: 240, overlapChars: 30 });
    const second = chunkKnowledgeText(source, { maxChars: 240, overlapChars: 30 });
    expect(first.length).toBeGreaterThan(1);
    expect(first).toEqual(second);
    expect(Math.max(...first.map(chunk => chunk.text.length))).toBeLessThanOrEqual(300);
  });
});
