import { describe, expect, it } from "vitest";
import { storageGet } from "./storage";

describe("storage key contract", () => {
  it("accepts a bounded relative object key", async () => {
    await expect(storageGet("workspaces/12/whatsapp/file.png")).resolves.toEqual({
      key: "workspaces/12/whatsapp/file.png",
      url: "/manus-storage/workspaces/12/whatsapp/file.png",
    });
  });

  it.each([
    "../outside",
    "workspaces/12/../11/file.png",
    "workspaces/12/%2e%2e/file.png",
    "workspaces/12/with\\slash",
    "workspaces/12/with\u0000control",
  ])("rejects unsafe key %s", async key => {
    await expect(storageGet(key)).rejects.toThrow("Invalid storage key");
  });
});
