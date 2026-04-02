import { NextResponse } from "next/server";
import { z } from "zod";
import { flags } from "@/config/flags";
import { prisma } from "@/lib/db";
import { resolveClassIdFromSelection } from "@/lib/classes/resolve-class";
import { verifyTwoCheckoutWebhookSignature } from "@/lib/payments/twocheckout";
import {
  createWebhookEventRecord,
  pickWebhookDeliveryId,
  pickWebhookSignature,
} from "@/lib/payments/webhook-idempotency";
import { isAllowedSubscriptionTierCents } from "@/lib/subscriptions/tiers";

export const runtime = "nodejs";

const webhookSchema = z.object({
  provider_tx_id: z.string().min(1),
  status: z.enum(["pending", "succeeded", "failed"]),
  type: z.enum([
    "subscription",
    "switch",
    "second_subscription",
    "upgrade_qna",
    "sticker",
    "gift",
    "bundle",
    "donation",
    "renewal",
  ]),
  user_id: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  tier_cents: z.number().int().optional(),
  subscription_id: z.string().optional(),
  class_id: z.string().optional(),
  house_name: z.string().optional(),
  level: z.number().int().positive().optional(),
  class_day: z.string().optional(),
  class_time: z.string().optional(),
  teacher_nickname: z.string().optional(),
});

function mapTransactionType(type: z.infer<typeof webhookSchema>["type"]) {
  switch (type) {
    case "subscription":
    case "renewal":
      return "SUBSCRIPTION" as const;
    case "switch":
      return "SWITCH" as const;
    case "second_subscription":
      return "SECOND_SUBSCRIPTION" as const;
    case "upgrade_qna":
      return "UPGRADE_QNA" as const;
    case "sticker":
      return "STICKER" as const;
    case "gift":
      return "GIFT" as const;
    case "bundle":
      return "BUNDLE" as const;
    case "donation":
      return "DONATION" as const;
  }
}

function mapTransactionStatus(status: z.infer<typeof webhookSchema>["status"]) {
  if (status === "succeeded") return "SUCCEEDED" as const;
  if (status === "failed") return "FAILED" as const;
  return "PENDING" as const;
}

export async function POST(request: Request) {
  if (!flags.paymentsEnabled) {
    return NextResponse.json(
      { error: "Payments disabled" },
      { status: 503 },
    );
  }

  try {
    const rawBody = await request.text();
    const signature = pickWebhookSignature(request.headers);
    const signatureValid = verifyTwoCheckoutWebhookSignature(rawBody, signature);
    if (!signatureValid) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = webhookSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const deliveryId = pickWebhookDeliveryId(request.headers);
    const eventRecord = await createWebhookEventRecord({
      providerTxId: payload.provider_tx_id,
      rawBody,
      signature,
      deliveryId,
    });
    if ("idempotent" in eventRecord) {
      return NextResponse.json({ received: true, idempotent: true }, { status: 200 });
    }
    const webhookEventId = eventRecord.id;

    const existing = await prisma.transaction.findUnique({
      where: { providerTxId: payload.provider_tx_id },
      select: { id: true },
    });
    if (existing) {
      await prisma.paymentWebhookEvent.update({
        where: { id: webhookEventId },
        data: {
          receivedStatus: "duplicate_transaction",
          processed: true,
          processedAt: new Date(),
        },
      });
      return NextResponse.json({ received: true, idempotent: true }, { status: 200 });
    }

    const classId = await resolveClassIdFromSelection({
      classId: payload.class_id ?? null,
      houseName: payload.house_name ?? null,
      level: payload.level ?? null,
      classDay: payload.class_day ?? null,
      classTime: payload.class_time ?? null,
      teacherNickname: payload.teacher_nickname ?? null,
    });

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId: payload.user_id,
          type: mapTransactionType(payload.type),
          amountCents: payload.amount_cents,
          providerTxId: payload.provider_tx_id,
          status: mapTransactionStatus(payload.status),
          metadataJson: {
            webhook: payload,
            resolved: { class_id: classId },
            webhookEventId,
          },
        },
      });

      if (payload.status !== "succeeded") {
        return { transactionId: transaction.id, effect: "none" as const };
      }

      if (payload.type === "subscription" || payload.type === "second_subscription") {
        if (!classId || !payload.tier_cents) {
          throw new Error("MISSING_SUBSCRIPTION_INPUT");
        }
        if (!isAllowedSubscriptionTierCents(payload.tier_cents)) {
          throw new Error("INVALID_SUBSCRIPTION_TIER");
        }

        const activeCount = await tx.subscription.count({
          where: { userId: payload.user_id, status: "ACTIVE" },
        });

        if (payload.type === "subscription" && activeCount >= 1) {
          throw new Error("ALREADY_HAS_ACTIVE_SUBSCRIPTION");
        }

        if (payload.type === "second_subscription" && activeCount >= 2) {
          throw new Error("MAX_SUBSCRIPTIONS_REACHED");
        }

        const now = new Date();
        const renewal = new Date(now);
        renewal.setDate(renewal.getDate() + 30);

        const subscription = await tx.subscription.create({
          data: {
            userId: payload.user_id,
            status: "ACTIVE",
            tierPriceCents: payload.tier_cents,
            classId,
            billingAnchor: now,
            renewalDate: renewal,
            switchUsedThisCycle: false,
          },
          select: { id: true },
        });

        return {
          transactionId: transaction.id,
          effect: payload.type,
          subscriptionId: subscription.id,
        };
      }

      if (payload.type === "switch") {
        if (!classId || !payload.subscription_id) {
          throw new Error("MISSING_SWITCH_INPUT");
        }

        const subscription = await tx.subscription.findUnique({
          where: { id: payload.subscription_id },
          select: {
            id: true,
            userId: true,
            status: true,
            switchUsedThisCycle: true,
          },
        });

        if (!subscription || subscription.userId !== payload.user_id) {
          throw new Error("SUBSCRIPTION_NOT_FOUND");
        }
        if (subscription.status !== "ACTIVE") {
          throw new Error("SUBSCRIPTION_NOT_ACTIVE");
        }
        if (subscription.switchUsedThisCycle) {
          throw new Error("SWITCH_ALREADY_USED_THIS_CYCLE");
        }

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            classId,
            switchUsedThisCycle: true,
          },
        });

        return {
          transactionId: transaction.id,
          effect: "switch",
          subscriptionId: subscription.id,
        };
      }

      if (payload.type === "renewal") {
        if (!payload.subscription_id) {
          throw new Error("MISSING_RENEWAL_SUBSCRIPTION");
        }

        const subscription = await tx.subscription.findUnique({
          where: { id: payload.subscription_id },
          select: { id: true, userId: true, renewalDate: true },
        });
        if (!subscription || subscription.userId !== payload.user_id) {
          throw new Error("SUBSCRIPTION_NOT_FOUND");
        }

        const renewalBase = subscription.renewalDate ?? new Date();
        const nextRenewal = new Date(renewalBase);
        nextRenewal.setDate(nextRenewal.getDate() + 30);

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "ACTIVE",
            renewalDate: nextRenewal,
            switchUsedThisCycle: false,
          },
        });

        return {
          transactionId: transaction.id,
          effect: "renewal",
          subscriptionId: subscription.id,
        };
      }

      return { transactionId: transaction.id, effect: "mirror-only" as const };
    });

    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEventId },
      data: {
        receivedStatus: "processed",
        processed: true,
        processedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        received: true,
        transactionId: result.transactionId,
        effect: result.effect,
        subscriptionId: "subscriptionId" in result ? result.subscriptionId : undefined,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error) {
      const known = new Set([
        "MISSING_SUBSCRIPTION_INPUT",
        "INVALID_SUBSCRIPTION_TIER",
        "ALREADY_HAS_ACTIVE_SUBSCRIPTION",
        "MAX_SUBSCRIPTIONS_REACHED",
        "MISSING_SWITCH_INPUT",
        "SUBSCRIPTION_NOT_FOUND",
        "SUBSCRIPTION_NOT_ACTIVE",
        "SWITCH_ALREADY_USED_THIS_CYCLE",
        "MISSING_RENEWAL_SUBSCRIPTION",
      ]);
      if (known.has(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }
    try {
      const raw = await request.clone().text();
      const parsed = webhookSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        await prisma.paymentWebhookEvent.updateMany({
          where: {
            provider: "TWOCHECKOUT",
            providerTxId: parsed.data.provider_tx_id,
            processed: false,
          },
          data: {
            receivedStatus: "failed_processing",
          },
        });
      }
    } catch {
      // no-op: best-effort failure status update
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
