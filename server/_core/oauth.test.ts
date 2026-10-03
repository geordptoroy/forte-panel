import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getUserInfo: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("./sdk", () => ({
  sdk: {
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    getUserInfo: mocks.getUserInfo,
  },
}));
vi.mock("../db", () => ({
  upsertUser: mocks.upsertUser,
}));

import { registerOAuthRoutes } from "./oauth";

type Handler = (req: any, res: any) => Promise<void>;

function setupRoute() {
  let handler: Handler | undefined;
  const app = {
    get: (_path: string, registered: Handler) => {
      handler = registered;
    },
  } as unknown as Express;
  registerOAuthRoutes(app);
  if (!handler) throw new Error("OAuth callback was not registered");
  return handler;
}

function createResponse() {
  const response: any = {
    status: vi.fn(),
    json: vi.fn(),
    clearCookie: vi.fn(),
    cookie: vi.fn(),
    redirect: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  response.clearCookie.mockReturnValue(response);
  response.cookie.mockReturnValue(response);
  response.redirect.mockReturnValue(response);
  return response;
}

describe("OAuth callback request boundaries", () => {
  const handler = setupRoute();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an oversized code or state before contacting the OAuth provider", async () => {
    const response = createResponse();

    await handler(
      { query: { code: "c".repeat(4097), state: "valid-state" }, headers: {} },
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("rejects a malformed state without exchanging the authorization code", async () => {
    const response = createResponse();

    await handler(
      {
        query: { code: "authorization-code", state: "not-the-cookie-state" },
        headers: {},
      },
      response
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: "invalid oauth state",
    });
    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
  });
});
