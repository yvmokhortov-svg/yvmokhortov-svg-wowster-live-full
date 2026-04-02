import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

export const DEFAULT_CUSTOM_GROUP_SEAT_PRICE_CENTS = 2500;

export function generateCustomGroupCheckoutReference(): string {
  return `cg-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function buildCustomGroupCheckoutUrl(input: {
  orderId: string;
  checkoutReference: string;
  totalAmountCents: number;
  contactEmail?: string | null;
  returnUrl?: string | null;
}): string {
  const baseUrl = "https://secure.2checkout.com/checkout/purchase";
  const url = new URL(baseUrl);
  url.searchParams.set("type", "custom_group_seats");
  url.searchParams.set("order_id", input.orderId);
  url.searchParams.set("order_ref", input.checkoutReference);
  url.searchParams.set("amount_cents", String(input.totalAmountCents));
  if (input.contactEmail) {
    url.searchParams.set("email", input.contactEmail);
  }
  if (input.returnUrl) {
    url.searchParams.set("return_url", input.returnUrl);
  }
  return url.toString();
}

export function generateCustomGroupSeatClaimToken(): string {
  return randomUUID().replaceAll("-", "");
}

export async function getCustomGroupOrderSummary(orderId: string) {
  return prisma.customGroupOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      numberOfSeats: true,
      claimedSeats: true,
      seatPriceCents: true,
      totalAmountCents: true,
      checkoutUrl: true,
      checkoutReference: true,
      country: true,
      preferredDaysTimes: true,
      ageRange: true,
      contactEmail: true,
      note: true,
      paidAt: true,
      activatedAt: true,
      closedAt: true,
      canceledAt: true,
      createdAt: true,
      updatedAt: true,
      sourceSupportTaskId: true,
      groupAdmin: {
        select: { id: true, email: true, nickname: true },
      },
      createdByAdmin: {
        select: { id: true, email: true, nickname: true },
      },
      seats: {
        orderBy: { seatIndex: "asc" },
        select: {
          id: true,
          seatIndex: true,
          status: true,
          claimToken: true,
          invitedEmail: true,
          claimedAt: true,
          claimedByUser: {
            select: {
              id: true,
              email: true,
              nickname: true,
            },
          },
        },
      },
    },
  });
}
