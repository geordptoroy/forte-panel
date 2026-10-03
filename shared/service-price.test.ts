import { describe, expect, it } from "vitest";
import { formatServicePrice } from "./service-price";

describe("service price presentation", () => {
  it("labels fixed and starting prices explicitly", () => {
    expect(formatServicePrice("fixed", 12_500)).toBe("R$ 125,00");
    expect(formatServicePrice("starting_at", 12_500)).toBe("A partir de R$ 125,00");
  });

  it("does not turn an unset amount into a free-price promise", () => {
    expect(formatServicePrice("fixed", 0)).toBe("Preço não informado");
    expect(formatServicePrice("starting_at", 0)).toBe("A partir de valor a definir");
    expect(formatServicePrice("quote", 12_500)).toBe("Sob consulta");
  });
});
