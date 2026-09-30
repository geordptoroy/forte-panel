export const servicePriceTypes = ["fixed", "starting_at", "quote"] as const;

export type ServicePriceType = (typeof servicePriceTypes)[number];

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Never turn an unset amount into a promise that the service is free. */
export function formatServicePrice(priceType: ServicePriceType, priceCents: number) {
  if (priceType === "quote") return "Sob consulta";
  if (priceCents <= 0)
    return priceType === "starting_at"
      ? "A partir de valor a definir"
      : "Preço não informado";
  const value = brl.format(priceCents / 100);
  return priceType === "starting_at" ? `A partir de ${value}` : value;
}
