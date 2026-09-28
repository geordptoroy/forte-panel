import { describe, expect, it } from "vitest";
import {
  InboxInstanceFilterError,
  normalizeInboxInstanceSelection,
} from "./inbox-instance-filter";

const workspaceAInstances = [
  { instanceId: "workspace-a-1" },
  { instanceId: "workspace-a-2" },
];

describe("Inbox instance filter validation", () => {
  it("treats null and omitted input as the explicit All selection", () => {
    expect(normalizeInboxInstanceSelection(null, workspaceAInstances)).toBeUndefined();
    expect(normalizeInboxInstanceSelection(undefined, workspaceAInstances)).toBeUndefined();
  });

  it("preserves one or several selected instances and removes duplicates", () => {
    expect(
      normalizeInboxInstanceSelection(["workspace-a-1"], workspaceAInstances)
    ).toEqual(["workspace-a-1"]);
    expect(
      normalizeInboxInstanceSelection(
        ["workspace-a-2", "workspace-a-1", "workspace-a-2"],
        workspaceAInstances
      )
    ).toEqual(["workspace-a-2", "workspace-a-1"]);
  });

  it("rejects an empty selection so it cannot silently broaden to All", () => {
    expect(() => normalizeInboxInstanceSelection([], workspaceAInstances)).toThrow(
      expect.objectContaining<Partial<InboxInstanceFilterError>>({ reason: "empty" })
    );
  });

  it("rejects an instance ID from another workspace", () => {
    expect(() =>
      normalizeInboxInstanceSelection(["workspace-b-1"], workspaceAInstances)
    ).toThrow(
      expect.objectContaining<Partial<InboxInstanceFilterError>>({
        reason: "unavailable",
      })
    );
  });
});
