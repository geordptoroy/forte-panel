import { describe, expect, it } from "vitest";
import { parseLocalPlatformAdminAccounts } from "./env";

describe("parseLocalPlatformAdminAccounts", () => {
  it("parses multiple independent platform admin accounts", () => {
    const accounts = parseLocalPlatformAdminAccounts(
      JSON.stringify([
        { email: "one@example.com", password: "one-password", name: "One" },
        { email: "two@example.com", password: "two-password", name: "Two" },
        { email: "three@example.com", password: "three-password", name: "Three" },
      ]),
      { email: "legacy@example.com", password: "legacy-password" }
    );

    expect(accounts).toHaveLength(4);
    expect(accounts.map(account => account.email)).toEqual([
      "one@example.com",
      "two@example.com",
      "three@example.com",
      "legacy@example.com",
    ]);
    expect(accounts.slice(0, 3).every(account => account.openId.startsWith("local_platform_admin:"))).toBe(true);
    expect(accounts[3]?.openId).toBe("local_admin");
  });

  it("keeps the legacy local_admin fallback when JSON is absent", () => {
    expect(
      parseLocalPlatformAdminAccounts(undefined, {
        email: "Admin@Example.com",
        password: "legacy-password",
      })
    ).toEqual([
      {
        email: "admin@example.com",
        password: "legacy-password",
        openId: "local_admin",
        name: "Administrador da plataforma",
      },
    ]);
  });

  it("rejects weak or malformed configured accounts", () => {
    expect(() =>
      parseLocalPlatformAdminAccounts(
        JSON.stringify([{ email: "admin@example.com", password: "short" }]),
        { email: "legacy@example.com", password: "legacy-password" }
      )
    ).toThrow("Conta de Console Admin inválida");
  });
});
