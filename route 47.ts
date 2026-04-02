import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { flags } from "@/config/flags";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveChatPermissions } from "@/lib/chat/access";
import { getBundlePricingMap } from "@/lib/chat/bundle-pricing";
import { loadChatCatalog } from "@/lib/chat/economy-catalog";
import { prisma } from "@/lib/db";
import { resolveActiveManualTrialToken } from "@/lib/manual-trials";

export const runtime = "nodejs";

const querySchema = z.object({
  streamId: z.string().trim().min(1).max(191),
  manualTrialToken: z.string().trim().min(1).max(191).optional(),
});

const actionSchema = z.object({
  streamId: z.string().trim().min(1).max(191),
  action: z.enum([
    "send_sticker",
    "send_gift",
    "send_tip",
    "buy_bundle_stickers",
    "buy_bundle_gifts",
  ]),
  itemId: z.string().trim().min(1).max(191).optional(),
  amountCents: z.number().int().positive().optional(),
  manualTrialToken: z.string().trim().min(1).max(191).optional(),
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

function internalProviderTxId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID()}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      streamId: searchParams.get("streamId"),
      manualTrialToken: searchParams.get("manualTrialToken") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const stream = await prisma.stream.findUnique({
      where: { id: parsed.data.streamId },
      select: {
        id: true,
        type: true,
        classId: true,
        ownerId: true,
        startedAt: true,
        status: true,
        class: { select: { lessonMinutes: true, qnaMinutes: true } },
      },
    });
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const permissions = await resolveChatPermissions({
      user: currentUser,
      stream: {
        id: stream.id,
        type: stream.type,
        classId: stream.classId,
        ownerId: stream.ownerId,
        startedAt: stream.startedAt,
        class: stream.class,
      },
    });
    const manualTrial =
      parsed.data.manualTrialToken
        ? await resolveActiveManualTrialToken({
            token: parsed.data.manualTrialToken,
            streamId: stream.id,
          })
        : null;
    const permissionsWithManualTrial = manualTrial
      ? {
          ...permissions,
          canRead: true,
          canSendText: true,
          canSendEconomy: true,
          reason: "Manual trial assignment active",
        }
      : permissions;

    const [catalog, bundlePricing] = await Promise.all([
      loadChatCatalog(),
      getBundlePricingMap(),
    ]);

    if (!currentUser) {
      return NextResponse.json(
        {
          permissions: permissionsWithManualTrial,
          manualTrial: !!manualTrial,
          paymentsEnabled: flags.paymentsEnabled,
          catalog,
          bundlePricing: {
            stickers: bundlePricing.STICKERS,
            gifts: bundlePricing.GIFTS,
          },
          wallet: {
            freeStickersRemaining: 0,
            stickerBundleRemaining: 0,
            giftBundleRemaining: 0,
          },
        },
        { status: 200 },
      );
    }

    await ensureMonthlyFreeStickerEntitlements(currentUser.id);
    const key = monthKeyUtc();
    const [entitlements, stickerBundle, giftBundle] = await Promise.all([
      prisma.entitlement.findMany({
        where: { userId: currentUser.id, monthKey: key },
        select: { freeStickersRemaining: true },
      }),
      prisma.bundle.findFirst({
        where: {
          userId: currentUser.id,
          type: "STICKERS",
          remainingItems: { gt: 0 },
        },
        orderBy: { createdAt: "asc" },
        select: { remainingItems: true },
      }),
      prisma.bundle.findFirst({
        where: {
          userId: currentUser.id,
          type: "GIFTS",
          remainingItems: { gt: 0 },
        },
        orderBy: { createdAt: "asc" },
        select: { remainingItems: true },
      }),
    ]);

    return NextResponse.json(
      {
        permissions: permissionsWithManualTrial,
        manualTrial: !!manualTrial,
        paymentsEnabled: flags.paymentsEnabled,
        catalog,
        bundlePricing: {
          stickers: bundlePricing.STICKERS,
          gifts: bundlePricing.GIFTS,
        },
        wallet: {
          freeStickersRemaining: entitlements.reduce(
            (sum, ent) => sum + ent.freeStickersRemaining,
            0,
          ),
          stickerBundleRemaining: stickerBundle?.remainingItems ?? 0,
          giftBundleRemaining: giftBundle?.remainingItems ?? 0,
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const stream = await prisma.stream.findUnique({
      where: { id: parsed.data.streamId },
      select: {
        id: true,
        type: true,
        classId: true,
        ownerId: true,
        startedAt: true,
        status: true,
        class: { select: { lessonMinutes: true, qnaMinutes: true } },
      },
    });
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }
    if (stream.status !== "LIVE") {
      return NextResponse.json({ error: "Stream is not live" }, { status: 409 });
    }

    const permissions = await resolveChatPermissions({
      user,
      stream: {
        id: stream.id,
        type: stream.type,
        classId: stream.classId,
        ownerId: stream.ownerId,
        startedAt: stream.startedAt,
        class: stream.class,
      },
    });
    const manualTrial =
      parsed.data.manualTrialToken
        ? await resolveActiveManualTrialToken({
            token: parsed.data.manualTrialToken,
            streamId: stream.id,
          })
        : null;
    const canSendEconomy = permissions.canSendEconomy || !!manualTrial;
    if (!canSendEconomy) {
      return NextResponse.json(
        { error: permissions.reason ?? "Chat economy actions are locked." },
        { status: 403 },
      );
    }

    await ensureMonthlyFreeStickerEntitlements(user.id);
    const [catalog, bundlePricing] = await Promise.all([
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

    if (parsed.data.action === "buy_bundle_stickers" || parsed.data.action === "buy_bundle_gifts") {
      const bundleType = parsed.data.action === "buy_bundle_stickers" ? "STICKERS" : "GIFTS";
      const pricing = bundleType === "STICKERS" ? bundlePricing.STICKERS : bundlePricing.GIFTS;
      const activeBundle = await prisma.bundle.findFirst({
        where: {
          userId: user.id,
          type: bundleType,
          remainingItems: { gt: 0 },
        },
        select: { id: true, remainingItems: true },
      });
      if (activeBundle) {
        return NextResponse.json(
          {
            error:
              bundleType === "STICKERS"
                ? "Finish your current sticker bundle first."
                : "Finish your current gift bundle first.",
          },
          { status: 409 },
        );
      }
      if (!pricing.active) {
        return NextResponse.json(
          {
            error:
              bundleType === "STICKERS"
                ? "Sticker bundle is currently disabled by admin."
                : "Gift bundle is currently disabled by admin.",
          },
          { status: 409 },
        );
      }

      if (!flags.paymentsEnabled) {
        return NextResponse.json(
          {
            requiresCheckout: true,
            checkoutPayload: {
              type: "bundle",
              bundle_type: bundleType === "STICKERS" ? "stickers" : "gifts",
              bundle_price_cents: pricing.bundlePriceCents,
              bundle_total_items: pricing.totalItems,
            },
          },
          { status: 200 },
        );
      }

      return NextResponse.json(
        {
          requiresCheckout: true,
          checkoutPayload: {
            type: "bundle",
            bundle_type: bundleType === "STICKERS" ? "stickers" : "gifts",
            bundle_price_cents: pricing.bundlePriceCents,
            bundle_total_items: pricing.totalItems,
          },
        },
        { status: 200 },
      );
    }

    if (parsed.data.action === "send_tip") {
      const amountCents = parsed.data.amountCents ?? 0;
      if (!amountCents) {
        return NextResponse.json({ error: "amountCents is required for TIP." }, { status: 400 });
      }
      return NextResponse.json(
        {
          requiresCheckout: true,
          checkoutPayload: {
            type: "donation",
            donation_amount_cents: amountCents,
          },
        },
        { status: 200 },
      );
    }

    if (parsed.data.action === "send_sticker") {
      const sticker = catalog.stickers.find((item) => item.id === parsed.data.itemId);
      if (!sticker) {
        return NextResponse.json({ error: "Sticker not found." }, { status: 404 });
      }

      const result = await prisma.$transaction(async (tx) => {
        const key = monthKeyUtc();
        const entitlement = await tx.entitlement.findFirst({
          where: {
            userId: user.id,
            monthKey: key,
            freeStickersRemaining: { gt: 0 },
          },
          orderBy: { createdAt: "asc" },
        });
        if (entitlement) {
          await tx.entitlement.update({
            where: { id: entitlement.id },
            data: { freeStickersRemaining: { decrement: 1 } },
          });
          await tx.transaction.create({
            data: {
              userId: user.id,
              type: "INTERNAL_MIRROR",
              amountCents: 0,
              providerTxId: internalProviderTxId("chat-sticker-free"),
              status: "SUCCEEDED",
              metadataJson: {
                source: "chat_sticker_entitlement",
                streamId: stream.id,
                itemId: sticker.id,
                itemName: sticker.name,
              },
            },
          });
          const message = await tx.chatMessage.create({
            data: {
              streamId: stream.id,
              userId: user.id,
              message: `<span>🎨 sent sticker: ${escapeHtml(sticker.name)}</span>`,
            },
            include: { user: { select: { id: true, nickname: true, role: true } } },
          });
          return { mode: "entitlement" as const, message };
        }

        const bundle = await tx.bundle.findFirst({
          where: {
            userId: user.id,
            type: "STICKERS",
            remainingItems: { gt: 0 },
          },
          orderBy: { createdAt: "asc" },
        });
        if (bundle) {
          await tx.bundle.update({
            where: { id: bundle.id },
            data: { remainingItems: { decrement: 1 } },
          });
          await tx.transaction.create({
            data: {
              userId: user.id,
              type: "INTERNAL_MIRROR",
              amountCents: bundle.perItemValueCents,
              providerTxId: internalProviderTxId("chat-sticker-bundle"),
              status: "SUCCEEDED",
              metadataJson: {
                source: "chat_sticker_bundle",
                streamId: stream.id,
                itemId: sticker.id,
                itemName: sticker.name,
              },
            },
          });
          const message = await tx.chatMessage.create({
            data: {
              streamId: stream.id,
              userId: user.id,
              message: `<span>🎨 sent sticker: ${escapeHtml(sticker.name)}</span>`,
            },
            include: { user: { select: { id: true, nickname: true, role: true } } },
          });
          return { mode: "bundle" as const, message };
        }

        return { mode: "checkout" as const, message: null };
      });

      if (result.mode === "checkout") {
        return NextResponse.json(
          {
            requiresCheckout: true,
            checkoutPayload: {
              type: "sticker",
              item_id: sticker.id,
            },
          },
          { status: 200 },
        );
      }

      return NextResponse.json(
        {
          ok: true,
          mode: result.mode,
          message: result.message
            ? {
                ...result.message,
                user: {
                  ...result.message.user,
                  nickname: isSupporter
                    ? `StudentSupporter ${result.message.user.nickname}`
                    : result.message.user.nickname,
                },
              }
            : null,
        },
        { status: 201 },
      );
    }

    const gift = catalog.gifts.find((item) => item.id === parsed.data.itemId);
    if (!gift) {
      return NextResponse.json({ error: "Gift not found." }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const bundle = await tx.bundle.findFirst({
        where: {
          userId: user.id,
          type: "GIFTS",
          remainingItems: { gt: 0 },
        },
        orderBy: { createdAt: "asc" },
      });
      if (bundle) {
        await tx.bundle.update({
          where: { id: bundle.id },
          data: { remainingItems: { decrement: 1 } },
        });
        await tx.transaction.create({
          data: {
            userId: user.id,
            type: "INTERNAL_MIRROR",
            amountCents: bundle.perItemValueCents,
            providerTxId: internalProviderTxId("chat-gift-bundle"),
            status: "SUCCEEDED",
            metadataJson: {
              source: "chat_gift_bundle",
              streamId: stream.id,
              itemId: gift.id,
              itemName: gift.name,
            },
          },
        });
        const message = await tx.chatMessage.create({
          data: {
            streamId: stream.id,
            userId: user.id,
            message: `<span>🎁 sent gift: ${escapeHtml(gift.name)}</span>`,
          },
          include: { user: { select: { id: true, nickname: true, role: true } } },
        });
        return { mode: "bundle" as const, message };
      }

      return { mode: "checkout" as const, message: null };
    });

    if (result.mode === "checkout") {
      return NextResponse.json(
        {
          requiresCheckout: true,
          checkoutPayload: {
            type: "gift",
            item_id: gift.id,
          },
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        mode: result.mode,
        message: result.message
          ? {
              ...result.message,
              user: {
                ...result.message.user,
                nickname: isSupporter
                  ? `StudentSupporter ${result.message.user.nickname}`
                  : result.message.user.nickname,
              },
            }
          : null,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
