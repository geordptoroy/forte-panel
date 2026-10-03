import { describe, expect, it } from "vitest";
import {
  getObservabilityTransportConfig,
  redactOperationalEvent,
} from "./observability";

describe("operational observability transport", () => {
  it("is disabled by default when no endpoint is configured", () => {
    expect(getObservabilityTransportConfig()).toMatchObject({
      enabled: false,
      authenticated: false,
      ready: false,
    });
  });

  it("redacts and bounds event fields without accepting arbitrary payloads", () => {
    const event = redactOperationalEvent({
      event: "  worker_heartbeat ",
      severity: "warning",
      service: " forte-panel-worker ",
      data: {
        ticks: 12,
        lastError: "Error: secret details must not be sent",
        nested: { token: "secret" } as never,
        "bad key": "discard",
      },
    });
    expect(event).toMatchObject({
      event: "worker_heartbeat",
      severity: "warning",
      service: "forte-panel-worker",
      data: {
        ticks: 12,
        lastError: "Error: secret details must not be sent",
      },
    });
    expect(event.data).not.toHaveProperty("nested");
    expect(event.data).not.toHaveProperty("bad key");
  });
});
