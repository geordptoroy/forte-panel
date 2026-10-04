import crypto from "node:crypto";
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
 * Without amountCents it sends a payment_info button with the zero-value order
 * envelope required by WhatsApp Web. With an amount, WhatsApp expects
 * review_and_pay, merchant_categorization_code, numeric total_amount and no
 * order object.
 */
export function buildPixPaymentPayload(
  options: PixPaymentOptions
): AnyMessageContent {
  const hasAmount = options.amountCents !== undefined;
  const params: Record<string, unknown> = {
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
  };

  params.reference_id = options.referenceId ?? crypto.randomUUID();
  params.type = "physical-goods";
  params.payment_configuration = "merchant_categorization_code";
  params.order_request_id = options.orderRequestId ?? crypto.randomUUID();
  params.total_amount = amount(hasAmount ? options.amountCents! : 0);
  if (!hasAmount)
    params.order = {
      status: "payment_requested",
      items: [
        {
          quantity: 0,
          retailer_id: crypto.randomUUID(),
          amount: amount(0),
          name: "",
          product_id: "",
          isCustomItem: false,
          isQuantitySet: false,
        },
      ],
      subtotal: amount(0),
      tax: null,
      shipping: null,
      discount: null,
    };

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
