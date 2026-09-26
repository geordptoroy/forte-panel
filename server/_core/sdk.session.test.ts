import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "./env";
import { sdk } from "./sdk";

describe("session version claim", () => {
  const previousSecret = ENV.cookieSecret;

  afterEach(() => {
    ENV.cookieSecret = previousSecret;
  });

  it("preserves the user's session version in the signed token", async () => {
    ENV.cookieSecret = "test-session-secret-with-enough-entropy";

    const token = await sdk.signSession({
      openId: "user-123",
      appId: "local",
      name: "Test User",
      sessionVersion: 7,
    });

    await expect(sdk.verifySession(token)).resolves.toMatchObject({
      openId: "user-123",
      sessionVersion: 7,
    });
  });

  it("defaults sessions without an explicit version to zero", async () => {
    ENV.cookieSecret = "test-session-secret-with-enough-entropy";

    const token = await sdk.signSession({
      openId: "user-legacy",
      appId: "local",
      name: "Legacy User",
    });

    await expect(sdk.verifySession(token)).resolves.toMatchObject({
      openId: "user-legacy",
      sessionVersion: 0,
    });
  });
});
