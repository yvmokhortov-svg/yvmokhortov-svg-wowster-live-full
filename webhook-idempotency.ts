import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

function hashHex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function pickWebhookSignature(headers: Headers): string | null {
  return (
    headers.get("x-2checkout-signature") ??
    headers.get("x-2co-signature") ??
    headers.get("x-webhook-signature")
  );
}

export function pickWebhookDeliveryId(headers: Headers): string | null {
  return (
    headers.get("x-2checkout-event-id") ??
    headers.get("x-2co-event-id") ??
    headers.get("x-webhook-id")
  );
}

export async function createWebhookEventRecord(input: {
  providerTxId: string;
  rawBody: string;
  signature: string | null;
  deliveryId: string | null;
}): Promise<{ id: string } | { idempotent: true }> {
  const payloadHash = hashHex(input.rawBody);
  const signatureHash = input.signature ? hashHex(input.signature) : null;
  try {
    const created = await prisma.paymentWebhookEvent.create({
      data: {
        provider: "TWOCHECKOUT",
        deliveryId: input.deliveryId,
        providerTxId: input.providerTxId,
        payloadHash,
        signatureHash,
        receivedStatus: "received",
        processed: false,
      },
      select: { id: true },
    });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { idempotent: true };
    }
    throw error;
  }
}

