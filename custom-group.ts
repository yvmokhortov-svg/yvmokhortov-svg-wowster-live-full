import { createTwoCheckoutSession } from "@/lib/payments/twocheckout";

export async function buildCustomGroupCheckoutUrl(input: {
  orderId: string;
  checkoutReference: string;
  totalAmountCents: number;
  contactEmail?: string | null;
  returnUrl?: string | null;
}): Promise<{ checkoutUrl: string; providerTxId: string }> {
  const session = await createTwoCheckoutSession({
    orderRef: input.checkoutReference,
    amountCents: input.totalAmountCents,
    currency: "USD",
    customerEmail: input.contactEmail ?? "group-order@wowster.live",
    returnUrl: input.returnUrl ?? null,
    metadata: {
      type: "custom_group_seats",
      order_id: input.orderId,
      checkout_reference: input.checkoutReference,
    },
  });
  return { checkoutUrl: session.checkoutUrl, providerTxId: session.providerTxId };
}
