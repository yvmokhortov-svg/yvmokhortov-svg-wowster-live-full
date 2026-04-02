import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { flags } from "@/config/flags";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  bundleAmountByType,
  giftAmountById,
  stickerAmountById,
  subscriptionAmountFromTier,
} from "@/lib/payments/amounts";
import {
  createTwoCheckoutSession,
  getTwoCheckoutConfigError,
  isTwoCheckoutConfigured,
} from "@/lib/payments/twocheckout";
import { prisma } from "@/lib/db";
import { resolveClassIdFromSelection } from "@/lib/classes/resolve-class";
import { isAllowedSubscriptionTierCents } from "@/lib/subscriptions/tiers";

export const runtime = "nodejs";

const createPaymentSessionSchema = z.object({
  type: z.enum([
    "subscription",
    "switch",
    "second_subscription",
    "upgrade_qna",
    "sticker",
    "gift",
    "bundle",
    "donation",
  ]),
  tier_cents: z.number().int().optional(),
  class_id: z.string().optional(),
  house_name: z.string().optional(),
  level: z.number().int().positive().optional(),
  class_day: z.string().optional(),
  class_time: z.string().optional(),
  teacher_nickname: z.string().optional(),
  item_id: z.string().optional(),
  bundle_type: z.enum(["stickers", "gifts"]).optional(),
  donation_amount_cents: z.number().int().positive().optional(),
  return_url: z.url().optional(),
});

function paymentTypeToTransactionType(type: z.infer<typeof createPaymentSessionSchema>["type"]) {
  switch (type) {
    case "subscription":
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

function createOrderRef(userId: string): string {
  return `wow-${Date.now()}-${userId.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const json = await request.json();
    const parsed = createPaymentSessionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    if (
      ["subscription", "switch", "second_subscription"].includes(parsed.data.type) &&
      !parsed.data.class_id &&
      !(
        parsed.data.house_name &&
        parsed.data.level &&
        parsed.data.class_day &&
        parsed.data.class_time &&
        parsed.data.teacher_nickname
      )
    ) {
      return NextResponse.json(
        {
          error:
            "For school subscription actions, provide class_id or house+level+class selection.",
        },
        { status: 400 },
      );
    }

    const isSchoolSubscriptionAction = [
      "subscription",
      "switch",
      "second_subscription",
    ].includes(parsed.data.type);
    const resolvedClassId = isSchoolSubscriptionAction
      ? await resolveClassIdFromSelection({
          classId: parsed.data.class_id ?? null,
          houseName: parsed.data.house_name ?? null,
          level: parsed.data.level ?? null,
          classDay: parsed.data.class_day ?? null,
          classTime: parsed.data.class_time ?? null,
          teacherNickname: parsed.data.teacher_nickname ?? null,
        })
      : null;

    if (isSchoolSubscriptionAction && !resolvedClassId) {
      return NextResponse.json(
        {
          error: "No matching class found for the selected house/level/time/teacher.",
        },
        { status: 404 },
      );
    }

    if (isSchoolSubscriptionAction) {
      if (
        (parsed.data.type === "subscription" || parsed.data.type === "second_subscription") &&
        (!parsed.data.tier_cents ||
          !isAllowedSubscriptionTierCents(parsed.data.tier_cents))
      ) {
        return NextResponse.json(
          { error: "Invalid subscription tier." },
          { status: 400 },
        );
      }

      const activeCount = await prisma.subscription.count({
        where: { userId: user.id, status: "ACTIVE" },
      });

      if (parsed.data.type === "subscription" && activeCount >= 1) {
        return NextResponse.json(
          {
            error:
              "You already have an active subscription. Use class switch or second subscription.",
          },
          { status: 409 },
        );
      }

      if (parsed.data.type === "second_subscription" && activeCount >= 2) {
        return NextResponse.json(
          { error: "Max 2 active subscriptions reached." },
          { status: 409 },
        );
      }

      if (parsed.data.type === "switch" && activeCount < 1) {
        return NextResponse.json(
          { error: "No active subscription to switch." },
          { status: 409 },
        );
      }
    }

    if (!flags.paymentsEnabled) {
      return NextResponse.json(
        {
          error: "Payments disabled",
          detail: "2Checkout integration is currently not enabled.",
          selection_preview: {
            class_id: resolvedClassId,
            house_name: parsed.data.house_name ?? null,
            level: parsed.data.level ?? null,
            class_day: parsed.data.class_day ?? null,
            class_time: parsed.data.class_time ?? null,
            teacher_nickname: parsed.data.teacher_nickname ?? null,
          },
        },
        { status: 503 },
      );
    }

    const type = parsed.data.type;
    const amountCents = await (async (): Promise<number | null> => {
      if (type === "subscription" || type === "second_subscription") {
        const tier = parsed.data.tier_cents;
        if (!tier) return null;
        return subscriptionAmountFromTier(tier);
      }
      if (type === "switch") {
        return 0;
      }
      if (type === "upgrade_qna") {
        return 1000;
      }
      if (type === "sticker") {
        if (!parsed.data.item_id) return null;
        return stickerAmountById(parsed.data.item_id);
      }
      if (type === "gift") {
        if (!parsed.data.item_id) return null;
        return giftAmountById(parsed.data.item_id);
      }
      if (type === "bundle") {
        if (!parsed.data.bundle_type) return null;
        const bundle = await bundleAmountByType(parsed.data.bundle_type);
        if (!bundle.active) return null;
        return bundle.amountCents;
      }
      if (type === "donation") {
        return parsed.data.donation_amount_cents ?? null;
      }
      return null;
    })();

    if (amountCents == null || amountCents < 0) {
      return NextResponse.json(
        { error: "Unable to resolve amount for this checkout request." },
        { status: 400 },
      );
    }

    const configError = getTwoCheckoutConfigError();
    if (!isTwoCheckoutConfigured()) {
      return NextResponse.json(
        {
          error: configError ?? "2Checkout configuration missing.",
        },
        { status: 503 },
      );
    }

    const orderRef = createOrderRef(user.id);
    const metadata = {
      type,
      user_id: user.id,
      class_id: resolvedClassId,
      tier_cents: parsed.data.tier_cents ?? null,
      item_id: parsed.data.item_id ?? null,
      bundle_type: parsed.data.bundle_type ?? null,
      donation_amount_cents: parsed.data.donation_amount_cents ?? null,
      house_name: parsed.data.house_name ?? null,
      level: parsed.data.level ?? null,
      class_day: parsed.data.class_day ?? null,
      class_time: parsed.data.class_time ?? null,
      teacher_nickname: parsed.data.teacher_nickname ?? null,
    } as const;

    const session = await createTwoCheckoutSession({
      orderRef,
      amountCents,
      currency: "USD",
      customerEmail: user.email,
      returnUrl: parsed.data.return_url ?? null,
      metadata,
    });

    const txType = paymentTypeToTransactionType(type);
    const createPendingTx = async () =>
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: txType,
          amountCents,
          providerTxId: session.providerTxId,
          status: "PENDING",
          metadataJson: {
            source: "create_session",
            orderRef,
            checkoutUrl: session.checkoutUrl,
            class_id: resolvedClassId,
            request: metadata,
          },
        },
        select: { id: true },
      });
    try {
      await createPendingTx();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      // If this provider transaction already exists, return session URL idempotently.
    }

    return NextResponse.json(
      {
        checkout_url: session.checkoutUrl,
        provider_tx_id: session.providerTxId,
        class_id: resolvedClassId,
        return_url: parsed.data.return_url ?? null,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
