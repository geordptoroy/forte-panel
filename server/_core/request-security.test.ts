import { afterEach, describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  assertLoginAllowed,
  assertSameOrigin,
  assertSignupAllowed,
  loginRateLimitConfig,
  recordLoginFailure,
  recordLoginSuccess,
  recordSignupAttempt,
  resetLoginRateLimitForTests,
  signupRateLimitConfig,
} from "./request-security";

function request(overrides: Partial<Request> = {}) {
  return {
    method: "POST",
    protocol: "https",
    headers: {},
    get(name: string) {
      return this.headers[name.toLowerCase() as keyof typeof this.headers] as
        | string
        | undefined;
    },
    ip: "203.0.113.10",
    socket: { remoteAddress: "203.0.113.10" },
    ...overrides,
  } as unknown as Request;
}

describe("request security", () => {
  afterEach(() => resetLoginRateLimitForTests());

  it("allows a same-origin mutation", () => {
    expect(() =>
      assertSameOrigin(
        request({
          headers: { origin: "https://panel.example.com", host: "panel.example.com" },
        })
      )
    ).not.toThrow();
  });

  it("rejects cross-origin mutations", () => {
    expect(() =>
      assertSameOrigin(
        request({
          headers: { origin: "https://evil.example", host: "panel.example.com" },
        })
      )
    ).toThrow("Origem da requisição não permitida");
  });

  it("rejects browser fetches explicitly marked cross-site", () => {
    expect(() =>
      assertSameOrigin(
        request({
          headers: {
            host: "panel.example.com",
            "sec-fetch-site": "cross-site",
          },
        })
      )
    ).toThrow("Origem da requisição não permitida");
  });

  it("blocks after the configured number of failed login attempts", () => {
    const req = request();
    const email = "owner@example.com";
    for (let i = 0; i < loginRateLimitConfig.maxFailures; i += 1) {
      assertLoginAllowed(req, email, 1_000);
      recordLoginFailure(req, email, 1_000 + i);
    }
    expect(() => assertLoginAllowed(req, email, 2_000)).toThrow(
      "Muitas tentativas de login"
    );
  });

  it("also blocks an account attacked from multiple IPs", () => {
    const email = "owner@example.com";
    for (let i = 0; i < loginRateLimitConfig.maxFailures; i += 1) {
      const req = request({ ip: `203.0.113.${i + 20}` });
      assertLoginAllowed(req, email, 1_000);
      recordLoginFailure(req, email, 1_000 + i);
    }
    expect(() => assertLoginAllowed(request(), email, 2_000)).toThrow(
      "Muitas tentativas de login"
    );
  });

  it("clears the failure bucket after a successful login", () => {
    const req = request();
    const email = "owner@example.com";
    recordLoginFailure(req, email, 1_000);
    recordLoginSuccess(req, email);
    expect(() => assertLoginAllowed(req, email, 2_000)).not.toThrow();
  });

  it("blocks repeated public signup attempts by IP and email", () => {
    const req = request();
    const email = "owner@example.com";
    for (let i = 0; i < signupRateLimitConfig.maxAttempts; i += 1) {
      assertSignupAllowed(req, email, 1_000);
      recordSignupAttempt(req, email, 1_000 + i);
    }
    expect(() => assertSignupAllowed(req, email, 2_000)).toThrow(
      "Muitas tentativas de cadastro"
    );
  });
});
