import { describe, expect, it } from "vitest";
import {
  assertOperationalWhatsappProvider,
  isOperationalWhatsappProvider,
} from "./baileys-policy";

describe("Baileys operational provider policy", () => {
  it("accepts only Baileys", () => {
    expect(isOperationalWhatsappProvider("baileys")).toBe(true);
    expect(assertOperationalWhatsappProvider("baileys")).toBe("baileys");
  });

  it.each(["papi", "meta_cloud_api", "", undefined, null])(
    "rejects legacy provider %s",
    provider => {
      expect(isOperationalWhatsappProvider(provider)).toBe(false);
      expect(() => assertOperationalWhatsappProvider(provider)).toThrow(
        "O único provedor de WhatsApp disponível neste produto é o gateway Baileys"
      );
    }
  );
});
