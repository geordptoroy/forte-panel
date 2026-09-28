import { describe, expect, it } from "vitest";
import { baileysStatusPollingInterval } from "./baileys-status";

describe("baileysStatusPollingInterval", () => {
  it.each(["connecting", "pairing", "qr"])(
    "refreshes the %s state quickly",
    status => {
      expect(baileysStatusPollingInterval(status)).toBe(2_000);
    }
  );

  it.each(["connected", "disconnected", "logged_out", "error", undefined])(
    "uses a lighter cadence for %s",
    status => {
      expect(baileysStatusPollingInterval(status)).toBe(15_000);
    }
  );
});
