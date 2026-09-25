import { describe, expect, it } from "vitest";
import { createIdempotencyKey } from "../../packages/n8n-nodes-forte-panel/nodes/FortePanel/idempotency";

describe("n8n Forte Panel idempotency key", () => {
  it("is stable when object properties arrive in a different order", () => {
    const first = createIdempotencyKey({
      executionId: "exec-123",
      operation: "queue_message",
      path: "/messages",
      body: { contactId: 7, content: "Olá" },
    });
    const retry = createIdempotencyKey({
      executionId: "exec-123",
      operation: "queue_message",
      path: "/messages",
      body: { content: "Olá", contactId: 7 },
    });
    expect(retry).toBe(first);
    expect(first.length).toBeLessThanOrEqual(180);
  });

  it("uses a different key for a different operation or payload", () => {
    const base = { executionId: "exec-123", operation: "criar_lead", path: "/lead-memory", body: { phone: "5511999999999" } };
    expect(createIdempotencyKey(base)).not.toBe(createIdempotencyKey({ ...base, operation: "atualizar_lead" }));
    expect(createIdempotencyKey(base)).not.toBe(createIdempotencyKey({ ...base, body: { phone: "5511888888888" } }));
  });

  it("accepts a valid explicit key and replaces invalid short keys", () => {
    const base = { executionId: "exec-123", operation: "create_appointment", path: "/appointments", body: {} };
    expect(createIdempotencyKey({ ...base, suppliedKey: "manual-retry-key" })).toBe("manual-retry-key");
    expect(createIdempotencyKey({ ...base, suppliedKey: "tiny" })).not.toBe("tiny");
  });
});
