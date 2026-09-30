import { describe, expect, it } from "vitest";
import {
  classifyWorkspaceMediaObjects,
  isWorkspaceMediaKey,
} from "./media-reconciliation";

describe("media reconciliation policy", () => {
  it("accepts only known workspace media prefixes", () => {
    expect(isWorkspaceMediaKey(12, "workspaces/12/outbound/file.png")).toBe(true);
    expect(isWorkspaceMediaKey(12, "workspaces/12/whatsapp/event-image.png")).toBe(true);
    expect(isWorkspaceMediaKey(12, "workspaces/12/onboarding-audio/1/file.webm")).toBe(true);
    expect(isWorkspaceMediaKey(12, "workspaces/13/outbound/file.png")).toBe(false);
    expect(isWorkspaceMediaKey(12, "workspaces/12/private/file.png")).toBe(false);
    expect(isWorkspaceMediaKey(12, "workspaces/12/outbound/../private/file.png")).toBe(false);
  });

  it("classifies only old, unreferenced objects as orphan candidates", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    const result = classifyWorkspaceMediaObjects({
      workspaceId: 12,
      now,
      protectionWindowMs: 24 * 60 * 60 * 1000,
      referencedKeys: new Set(["workspaces/12/outbound/referenced.png"]),
      objects: [
        { key: "workspaces/12/outbound/referenced.png", lastModifiedAt: new Date("2026-09-01") },
        { key: "workspaces/12/whatsapp/old.png", lastModifiedAt: new Date("2026-09-01") },
        { key: "workspaces/12/whatsapp/new.png", lastModifiedAt: new Date("2026-09-30T11:30:00.000Z") },
        { key: "workspaces/99/outbound/other.png", lastModifiedAt: new Date("2026-09-01") },
        { key: "shared/unknown.png", lastModifiedAt: new Date("2026-09-01") },
      ],
    });

    expect(result.referenced).toEqual(["workspaces/12/outbound/referenced.png"]);
    expect(result.orphanCandidates).toEqual(["workspaces/12/whatsapp/old.png"]);
    expect(result.protected).toEqual(["workspaces/12/whatsapp/new.png"]);
    expect(result.unknown).toEqual(["shared/unknown.png", "workspaces/99/outbound/other.png"]);
  });
});
