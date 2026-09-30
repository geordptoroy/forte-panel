import { describe, expect, it } from "vitest";
import { reconnectDelayMs } from "./reconnect-policy.js";

describe("WhatsApp reconnect backoff", () => {
  it("uses exponential delays with bounded jitter", () => {
    expect(reconnectDelayMs(1, () => 0)).toBe(800);
    expect(reconnectDelayMs(1, () => 1)).toBe(1_200);
    expect(reconnectDelayMs(4, () => 0.5)).toBe(8_000);
  });

  it("caps retries and handles invalid attempt values", () => {
    expect(reconnectDelayMs(0, () => 0.5)).toBe(1_000);
    expect(reconnectDelayMs(Number.NaN, () => 0.5)).toBe(1_000);
    expect(reconnectDelayMs(100, () => 1)).toBe(60_000);
  });
});
