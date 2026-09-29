import { describe, expect, it } from "vitest";
import {
  shouldAssignBootstrapOwnerMembership,
  shouldProvisionDefaultWorkspace,
} from "./db";

describe("workspace owner bootstrap policy", () => {
  it("allows the configured owner to claim an empty installation", () => {
    expect(shouldAssignBootstrapOwnerMembership({
      openId: "configured-owner",
      ownerOpenId: "configured-owner",
      canBootstrapAdmin: true,
    })).toBe(true);
  });

  it("does not grant owner membership to an unrelated first OAuth user", () => {
    expect(shouldAssignBootstrapOwnerMembership({
      openId: "ordinary-user",
      ownerOpenId: "configured-owner",
      canBootstrapAdmin: true,
    })).toBe(false);
  });

  it("does not infer an owner when the bootstrap identity is unset", () => {
    expect(shouldAssignBootstrapOwnerMembership({
      openId: "ordinary-user",
      ownerOpenId: "",
      canBootstrapAdmin: true,
    })).toBe(false);
  });

  it("preserves an explicitly bootstrapped or existing global administrator", () => {
    expect(shouldAssignBootstrapOwnerMembership({
      openId: "admin-user",
      role: "admin",
      ownerOpenId: "",
      canBootstrapAdmin: false,
    })).toBe(true);
    expect(shouldAssignBootstrapOwnerMembership({
      openId: "admin-user",
      existingRole: "admin",
      ownerOpenId: "",
      canBootstrapAdmin: false,
    })).toBe(true);
  });
});

describe("default workspace provisioning policy", () => {
  it("does not create a default workspace during normal login", () => {
    expect(
      shouldProvisionDefaultWorkspace({
        demoMode: false,
        bootstrapEnabled: false,
      })
    ).toBe(false);
  });

  it("allows explicit demo mode or deployment bootstrap", () => {
    expect(
      shouldProvisionDefaultWorkspace({ demoMode: true, bootstrapEnabled: false })
    ).toBe(true);
    expect(
      shouldProvisionDefaultWorkspace({ demoMode: false, bootstrapEnabled: true })
    ).toBe(true);
  });
});
