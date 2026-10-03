import { describe, expect, it } from "vitest";
import { requestIdFor } from "./request-context";

describe("request correlation", () => {
  it("preserves a bounded safe request id", () => {
    expect(requestIdFor("trace-42:panel")).toBe("trace-42:panel");
  });

  it("generates a fresh id for missing or unsafe input", () => {
    const first = requestIdFor(undefined);
    const second = requestIdFor("bad value\nX-Injected: yes");
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
  });

  it("bounds the accepted id length", () => {
    expect(requestIdFor("a".repeat(129))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
