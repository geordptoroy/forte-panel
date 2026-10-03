import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getWorkspaceMembershipContext: vi.fn(),
  consumeWorkspaceUsage: vi.fn(),
}));

vi.mock("../db", () => ({
  getWorkspaceMembershipContext: mocks.getWorkspaceMembershipContext,
  consumeWorkspaceUsage: mocks.consumeWorkspaceUsage,
}));
vi.mock("./env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.example",
    forgeApiKey: "test-forge-key",
  },
}));
vi.mock("./sdk", () => ({
  sdk: { authenticateRequest: mocks.authenticateRequest },
}));

import { registerStorageProxy } from "./storageProxy";

type Handler = (req: any, res: any) => Promise<void>;

function setupRoute() {
  let handler: Handler | undefined;
  const app = {
    get: (_path: string, registered: Handler) => {
      handler = registered;
    },
  } as unknown as Express;
  registerStorageProxy(app);
  if (!handler) throw new Error("storage route handler was not registered");
  return handler;
}

function createResponse() {
  const response: any = {
    status: vi.fn(),
    send: vi.fn(),
    set: vi.fn(),
    setHeader: vi.fn(),
    redirect: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.send.mockReturnValue(response);
  response.set.mockReturnValue(response);
  response.redirect.mockReturnValue(response);
  return response;
}

describe("storage proxy tenant authorization", () => {
  const handler = setupRoute();
  const forgeFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue({ id: 101 });
    mocks.getWorkspaceMembershipContext.mockResolvedValue({ workspaceId: 42 });
    mocks.consumeWorkspaceUsage.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      retryAfterMs: 60_000,
    });
    forgeFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://signed.example/private-object" }),
    });
    vi.stubGlobal("fetch", forgeFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not presign a key owned by another workspace", async () => {
    const response = createResponse();

    await handler(
      { params: { 0: "workspaces/43/outbound/private.ogg" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(forgeFetch).not.toHaveBeenCalled();
  });

  it("presigns an object under the authenticated workspace prefix", async () => {
    const response = createResponse();

    await handler(
      { params: { 0: "workspaces/42/outbound/private.ogg" } },
      response
    );

    expect(mocks.getWorkspaceMembershipContext).toHaveBeenCalledWith(101);
    expect(forgeFetch).toHaveBeenCalledTimes(1);
    expect(response.set).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(response.redirect).toHaveBeenCalledWith(
      307,
      "https://signed.example/private-object"
    );
  });

  it("fails closed when the user has no single active workspace", async () => {
    mocks.getWorkspaceMembershipContext.mockResolvedValueOnce(null);
    const response = createResponse();

    await handler(
      { params: { 0: "workspaces/42/outbound/private.ogg" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(forgeFetch).not.toHaveBeenCalled();
  });

  it("does not presign media after the workspace API quota is exhausted", async () => {
    mocks.consumeWorkspaceUsage.mockResolvedValueOnce({
      allowed: false,
      limit: 100,
      remaining: 0,
      retryAfterMs: 30_000,
    });
    const response = createResponse();

    await handler(
      { params: { 0: "workspaces/42/outbound/private.ogg" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "30");
    expect(forgeFetch).not.toHaveBeenCalled();
  });

  it("rejects encoded traversal and unscoped storage keys before presigning", async () => {
    const traversalResponse = createResponse();
    await handler(
      { params: { 0: "workspaces/42/%2e%2e/43/private.ogg" } },
      traversalResponse
    );
    expect(traversalResponse.status).toHaveBeenCalledWith(400);

    const unscopedResponse = createResponse();
    await handler({ params: { 0: "generated/private.png" } }, unscopedResponse);
    expect(unscopedResponse.status).toHaveBeenCalledWith(404);
    expect(forgeFetch).not.toHaveBeenCalled();
  });
});
