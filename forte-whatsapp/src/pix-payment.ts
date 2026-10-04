import type { AnyMessageContent } from "baileys";

export type PixPaymentOptions = {
  merchantName: string;
  pixKey: string;
  pixKeyType: "CPF" | "CNPJ" | "PHONE" | "EMAIL" | "EVP" | string;
  amountCents?: number;
  currency?: string;
  referenceId?: string;
  orderRequestId?: string;
};

function amount(value: number) {
  return { value, offset: 1000 };
}

/**
 * Builds the native WhatsApp Pix envelope observed from a real payment card.
 *
 * Without amountCents it sends a copy-key/payment_info button. With an amount,
 * WhatsApp expects review_and_pay, merchant_categorization_code, numeric
 * total_amount and no order object.
 */
export function buildPixPaymentPayload(
  options: PixPaymentOptions
): AnyMessageContent {
  const hasAmount = options.amountCents !== undefined;
  const params: Record<string, unknown> = {
    reference_id: options.referenceId ?? "",
    type: hasAmount ? "physical-goods" : "",
    payment_configuration: hasAmount ? "merchant_categorization_code" : "",
    payment_settings: [
      {
        type: "pix_static_code",
        pix_static_code: {
          merchant_name: options.merchantName,
          key: options.pixKey,
          key_type: options.pixKeyType,
        },
      },
    ],
    currency: options.currency ?? "BRL",
    order_request_id: options.orderRequestId ?? "",
  };

  if (hasAmount) {
    params.total_amount = amount(options.amountCents!);
  }

  return {
    interactiveMessage: {
      body: { text: "" },
      nativeFlowMessage: {
        messageVersion: 1,
        buttons: [
          {
            name: hasAmount ? "review_and_pay" : "payment_info",
            buttonParamsJson: JSON.stringify(params),
          },
        ],
      },
    },
  } as unknown as AnyMessageContent;
}
