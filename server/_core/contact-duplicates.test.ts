import { describe, expect, it } from "vitest";
import { groupContactDuplicates } from "./contact-duplicates";

describe("contact duplicate audit", () => {
  it("groups equivalent phone formats within the same workspace", () => {
    const groups = groupContactDuplicates([
      { id: 2, workspaceId: 10, externalPhone: "55 11 99999-9999", name: "B", createdAt: "", updatedAt: "" },
      { id: 1, workspaceId: 10, externalPhone: "+55 (11) 99999-9999", name: "A", createdAt: "", updatedAt: "" },
      { id: 3, workspaceId: 10, externalPhone: "5511888888888", name: "C", createdAt: "", updatedAt: "" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ workspaceId: 10, canonicalPhone: "5511999999999" });
    expect(groups[0]?.contacts.map(contact => contact.id)).toEqual([1, 2]);
  });

  it("never groups equal phone keys across workspaces", () => {
    const groups = groupContactDuplicates([
      { id: 1, workspaceId: 10, externalPhone: "5511999999999", name: "A", createdAt: "", updatedAt: "" },
      { id: 2, workspaceId: 11, externalPhone: "+55 11 99999-9999", name: "B", createdAt: "", updatedAt: "" },
    ]);
    expect(groups).toHaveLength(0);
  });

  it("does not collapse canonical LID or group identities into phone numbers", () => {
    const groups = groupContactDuplicates([
      { id: 1, workspaceId: 10, externalPhone: "lid:1234", name: "LID", createdAt: "", updatedAt: "" },
      { id: 2, workspaceId: 10, externalPhone: "1234", name: "Phone", createdAt: "", updatedAt: "" },
      { id: 3, workspaceId: 10, externalPhone: "1234@g.us", name: "Group", createdAt: "", updatedAt: "" },
      { id: 4, workspaceId: 10, externalPhone: "group:1234", name: "Group 2", createdAt: "", updatedAt: "" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.canonicalPhone).toBe("group:1234");
    expect(groups[0]?.contacts.map(contact => contact.id)).toEqual([3, 4]);
  });
});
