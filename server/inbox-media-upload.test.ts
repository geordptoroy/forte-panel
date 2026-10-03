import { beforeEach, describe, expect, it, vi } from "vitest";
import { storagePut } from "./storage";
import {
  isSupportedInboxMimeType,
  isWorkspaceInboxMediaKey,
  uploadPrivateInboxAttachment,
} from "./inbox-media-upload";

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

describe("private Inbox attachment contract", () => {
  beforeEach(() => {
    vi.mocked(storagePut).mockReset();
  });

  it("allows only supported MIME types for each media kind", () => {
    expect(isSupportedInboxMimeType("image", "image/png")).toBe(true);
    expect(isSupportedInboxMimeType("audio", "audio/webm;codecs=opus")).toBe(
      true
    );
    expect(isSupportedInboxMimeType("document", "application/pdf")).toBe(true);
    expect(isSupportedInboxMimeType("image", "image/svg+xml")).toBe(false);
    expect(isSupportedInboxMimeType("video", "application/pdf")).toBe(false);
  });

  it("accepts only non-traversing keys under the current workspace outbound prefix", () => {
    expect(
      isWorkspaceInboxMediaKey(12, "workspaces/12/outbound/file.png_abcd1234")
    ).toBe(true);
    expect(
      isWorkspaceInboxMediaKey(12, "workspaces/13/outbound/file.png_abcd1234")
    ).toBe(false);
    expect(
      isWorkspaceInboxMediaKey(12, "workspaces/12/outbound/../private/file")
    ).toBe(false);
  });

  it("rejects an unsupported upload before requesting storage", async () => {
    await expect(
      uploadPrivateInboxAttachment({
        workspaceId: 12,
        type: "image",
        fileName: "vector.svg",
        mimeType: "image/svg+xml",
        dataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
      })
    ).rejects.toThrow("INBOX_MEDIA_INVALID");
  });

  it("fails closed instead of placing Base64 in the outbound message", async () => {
    vi.mocked(storagePut).mockRejectedValueOnce(new Error("forge unavailable"));

    await expect(
      uploadPrivateInboxAttachment({
        workspaceId: 12,
        type: "image",
        fileName: "small.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,AA==",
      })
    ).rejects.toThrow("INBOX_MEDIA_STORAGE_UNAVAILABLE");
  });
});
