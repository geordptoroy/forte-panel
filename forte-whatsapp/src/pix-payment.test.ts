import { describe, expect, it } from "vitest";
import { buildPixPaymentPayload } from "./pix-payment.js";

type NativePayload = {
  interactiveMessage: {
    nativeFlowMessage: {
      buttons: Array<{ name: string; buttonParamsJson: string }>;
    };
  };
};

function readButtonParams(payload: unknown) {
  const button = (payload as NativePayload).interactiveMessage.nativeFlowMessage
    .buttons[0];
  return { button, params: JSON.parse(button.buttonParamsJson) as Record<string, any> };
}

describe("native Pix payment payload", () => {
  it("builds the copy-key button without an amount", () => {
    const { button, params } = readButtonParams(
      buildPixPaymentPayload({
        merchantName: "Rafael",
        pixKey: "10703598660",
        pixKeyType: "CPF",
      })
    );

    expect(button.name).toBe("payment_info");
    expect(params.total_amount).toBeUndefined();
    expect(params.payment_settings[0].pix_static_code).toMatchObject({
      merchant_name: "Rafael",
      key: "10703598660",
      key_type: "CPF",
    });
  });

  it("uses the observed review_and_pay envelope for a value", () => {
    const { button, params } = readButtonParams(
      buildPixPaymentPayload({
        merchantName: "rafael",
        pixKey: "38999034689",
        pixKeyType: "PHONE",
        amountCents: 10000,
        referenceId: "4WCW4SAQ6RY",
        orderRequestId: "4WCW4SAQC4C",
      })
    );

    expect(button.name).toBe("review_and_pay");
    expect(params).toMatchObject({
      reference_id: "4WCW4SAQ6RY",
      type: "physical-goods",
      payment_configuration: "merchant_categorization_code",
      currency: "BRL",
      order_request_id: "4WCW4SAQC4C",
      total_amount: { value: 10000, offset: 1000 },
    });
    expect(params.order).toBeUndefined();
  });
});
