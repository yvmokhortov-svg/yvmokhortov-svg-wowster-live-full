import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBundlePricingMap } from "@/lib/chat/bundle-pricing";
import { loadChatCatalog } from "@/lib/chat/economy-catalog";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const checkoutCallbackSchema = z.object({
  streamId: z.string().trim().min(1).max(191),
  kind: z.enum(["sticker", "gift", "tip", "bundle_stickers", "bundle_gifts"]),
  itemId: z.string().trim().min(1).max(191).optional(),
  amountCents: z.number().int().positive().optional(),
  providerTxId: z.string().trim().min(1).max(191),
});

function monthKeyUtc(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function ensureMonthlyFreeStickerEntitlements(userId: string): Promise<void> {
  const key = monthKeyUtc();
  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      userId,
      status: "ACTIVE",
      tierPriceCents: { in: [2000, 5500, 9900] },
    },
    select: { tierPriceCents: true },
    distinct: ["tierPriceCents"],
  });

  const sources = activeSubscriptions.map((sub) => {
    if (sub.tierPriceCents === 2000) return "referral20";
    if (sub.tierPriceCents === 5500) return "tier55";
    return "tier99";
  });
  if (!sources.length) return;

  await Promise.all(
    sources.map((source) =>
      prisma.entitlement.upsert({
        where: {
          userId_monthKey_source: {
            userId,
            monthKey: key,
            source,
          },
        },
        update: {},
        create: {
          userId,
          monthKey: key,
          source,
          freeStickersRemaining: 6,
        },
      }),
    ),
  );
}

async function getWalletSnapshot(userId: string) {
  await ensureMonthlyFreeStickerEntitlements(userId);
  const key = monthKeyUtc();
  const [entitlements, stickerBundle, giftBundle] = await Promise.all([
    prisma.entitlement.findMany({
      where: { userId, monthKey: key },
      select: { freeStickersRemaining: true },
    }),
    prisma.bundle.findFirst({
      where: {
        userId,
        type: "STICKERS",
        remainingItems: { gt: 0 },
      },
      orderBy: { createdAt: "asc" },
      select: { remainingItems: true },
    }),
    prisma.bundle.findFirst({
      where: {
        userId,
        type: "GIFTS",
        remainingItems: { gt: 0 },
      },
      orderBy: { createdAt: "asc" },
      select: { remainingItems: true },
    }),
  ]);

  return {
    freeStickersRemaining: entitlements.reduce((sum, ent) => sum + ent.freeStickersRemaining, 0),
    stickerBundleRemaining: stickerBundle?.remainingItems ?? 0,
    giftBundleRemaining: giftBundle?.remainingItems ?? 0,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = checkoutCallbackSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const stream = await prisma.stream.findUnique({
      where: { id: parsed.data.streamId },
      select: { id: true, status: true },
    });
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const existing = await prisma.transaction.findUnique({
      where: { providerTxId: parsed.data.providerTxId },
      select: { id: true },
    });
    if (existing) {
      const wallet = await getWalletSnapshot(user.id);
      return NextResponse.json({ ok: true, idempotent: true, wallet }, { status: 200 });
    }

    const [{ stickers, gifts }, bundlePricing] = await Promise.all([
      loadChatCatalog(),
      getBundlePricingMap(),
    ]);
    const isSupporter = !!(await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
        tierPriceCents: { gte: 9900 },
      },
      select: { id: true },
    }));

    const result = await prisma.$transaction(async (tx) => {
      if (parsed.data.kind === "sticker") {
        const item = stickers.find((sticker) => sticker.id === parsed.data.itemId);
        if (!item) throw new Error("STICKER_NOT_FOUND");
        await tx.transaction.create({
          data: {
            userId: user.id,
            type: "STICKER",
            amountCents: item.priceCents,
            providerTxId: parsed.data.providerTxId,
            status: "SUCCEEDED",
            metadataJson: {
              source: "chat_checkout_callback",
              streamId: stream.id,
              kind: parsed.data.kind,
              itemId: item.id,
              itemName: item.name,
            },
          },
        });
        if (stream.status !== "LIVE") return { message: null };
        const message = await tx.chatMessage.create({
          data: {
            streamId: stream.id,
            userId: user.id,
            message: `<span>🎨 purchased sticker: ${escapeHtml(item.name)}</span>`,
          },
          include: { user: { select: { id: true, nickname: true, role: true } } },
        });
        return { message };
      }

      if (parsed.data.kind === "gift") {
        const item = gifts.find((gift) => gift.id === parsed.data.itemId);
        if (!item) throw new Error("GIFT_NOT_FOUND");
        await tx.transaction.create({
          data: {
            userId: user.id,
            type: "GIFT",
            amountCents: item.priceCents,
            providerTxId: parsed.data.providerTxId,
            status: "SUCCEEDED",
            metadataJson: {
              source: "chat_checkout_callback",
              streamId: stream.id,
              kind: parsed.data.kind,
              itemId: item.id,
              itemName: item.name,
            },
          },
        });
        if (stream.status !== "LIVE") return { message: null };
        const message = await tx.chatMessage.create({
          data: {
            streamId: stream.id,
            userId: user.id,
            message: `<span>🎁 purchased gift: ${escapeHtml(item.name)}</span>`,
          },
          include: { user: { select: { id: true, nickname: true, role: true } } },
        });
        return { message };
      }

      if (parsed.data.kind === "tip") {
        const amount = parsed.data.amountCents ?? 0;
        if (!amount) throw new Error("TIP_AMOUNT_REQUIRED");
        await tx.transaction.create({
          data: {
            userId: user.id,
            type: "DONATION",
            amountCents: amount,
            providerTxId: parsed.data.providerTxId,
            status: "SUCCEEDED",
            metadataJson: {
              source: "chat_checkout_callback",
              streamId: stream.id,
              kind: parsed.data.kind,
            },
          },
        });
        if (stream.status !== "LIVE") return { message: null };
        const message = await tx.chatMessage.create({
          data: {
            streamId: stream.id,
            userId: user.id,
            message: `<span>💚 sent TIP: $${(amount / 100).toFixed(2)}</span>`,
          },
          include: { user: { select: { id: true, nickname: true, role: true } } },
        });
        return { message };
      }

      if (parsed.data.kind === "bundle_stickers") {
        const existingBundle = await tx.bundle.findFirst({
          where: {
            userId: user.id,
            type: "STICKERS",
            remainingItems: { gt: 0 },
          },
          select: { id: true },
        });
        if (existingBundle) throw new Error("STICKER_BUNDLE_ALREADY_ACTIVE");

        const bundlePrice = bundlePricing.STICKERS.bundlePriceCents;
        const totalItems = bundlePricing.STICKERS.totalItems;
        await tx.bundle.create({
          data: {
            userId: user.id,
            type: "STICKERS",
            totalItems,
            remainingItems: totalItems,
            perItemValueCents: Math.floor(bundlePrice / totalItems),
          },
        });
        await tx.transaction.create({
          data: {
            userId: user.id,
            type: "BUNDLE",
            amountCents: bundlePrice,
            providerTxId: parsed.data.providerTxId,
            status: "SUCCEEDED",
            metadataJson: {
              source: "chat_checkout_callback",
              streamId: stream.id,
              kind: parsed.data.kind,
            },
          },
        });
        return { message: null };
      }

      const existingBundle = await tx.bundle.findFirst({
        where: {
          userId: user.id,
          type: "GIFTS",
          remainingItems: { gt: 0 },
        },
        select: { id: true },
      });
      if (existingBundle) throw new Error("GIFT_BUNDLE_ALREADY_ACTIVE");

      const bundlePrice = bundlePricing.GIFTS.bundlePriceCents;
      const totalItems = bundlePricing.GIFTS.totalItems;
      await tx.bundle.create({
        data: {
          userId: user.id,
          type: "GIFTS",
          totalItems,
          remainingItems: totalItems,
          perItemValueCents: Math.floor(bundlePrice / totalItems),
        },
      });
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "BUNDLE",
          amountCents: bundlePrice,
          providerTxId: parsed.data.providerTxId,
          status: "SUCCEEDED",
          metadataJson: {
            source: "chat_checkout_callback",
            streamId: stream.id,
            kind: parsed.data.kind,
          },
        },
      });
      return { message: null };
    });

    const wallet = await getWalletSnapshot(user.id);
    const normalizedMessage = result.message
      ? {
          ...result.message,
          user: {
            ...result.message.user,
            nickname: isSupporter
              ? `StudentSupporter ${result.message.user.nickname}`
              : result.message.user.nickname,
          },
        }
      : null;

    return NextResponse.json(
      {
        ok: true,
        message: normalizedMessage,
        wallet,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error) {
      const known = new Set([
        "STICKER_NOT_FOUND",
        "GIFT_NOT_FOUND",
        "TIP_AMOUNT_REQUIRED",
        "STICKER_BUNDLE_ALREADY_ACTIVE",
        "GIFT_BUNDLE_ALREADY_ACTIVE",
      ]);
      if (known.has(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
