import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { findLocalPasswordAccount } from "./db";

function localHash(password: string, salt = "test-salt") {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

describe("local login account selection", () => {
  it("selects the account whose password matches when an old duplicate has no password", () => {
    const account = findLocalPasswordAccount(
      [
        { id: 1, openId: "local_admin", passwordHash: null },
        { id: 7, openId: "local_signup", passwordHash: localHash("owner-password") },
      ],
      "owner-password"
    );

    expect(account).toMatchObject({ id: 7, openId: "local_signup" });
  });

  it("does not select any account when the password does not match", () => {
    expect(
      findLocalPasswordAccount(
        [{ id: 7, passwordHash: localHash("owner-password") }],
        "wrong-password"
      )
    ).toBeUndefined();
  });
});
