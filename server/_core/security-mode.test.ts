import { afterEach, describe, expect, it } from "vitest";
import { securityFailClosed } from "./security-mode";

describe("security backend mode", () => {
  const previous = process.env.FORTE_SECURITY_FAIL_CLOSED;

  afterEach(() => {
    if (previous === undefined) delete process.env.FORTE_SECURITY_FAIL_CLOSED;
    else process.env.FORTE_SECURITY_FAIL_CLOSED = previous;
  });

  it("can be enabled explicitly without changing CORE_ONLY_MODE", () => {
    process.env.FORTE_SECURITY_FAIL_CLOSED = "true";
    expect(securityFailClosed()).toBe(true);
  });

  it("does not activate for ordinary local test mode by default", () => {
    delete process.env.FORTE_SECURITY_FAIL_CLOSED;
    expect(process.env.NODE_ENV).not.toBe("production");
    expect(securityFailClosed()).toBe(false);
  });
});
