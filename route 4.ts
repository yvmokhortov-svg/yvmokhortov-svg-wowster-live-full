import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveChatPermissions } from "@/lib/chat/access";
import { sanitizeChatRichText } from "@/lib/chat/rich-text";
import { prisma } from "@/lib/db";
import { resolveActiveManualTrialToken } from "@/lib/manual-trials";
import { findBlockedChatContent } from "@/lib/moderation/text-safety";

export const runtime = "nodejs";

const listChatMessagesSchema = z.object({
  streamId: z.string().trim().min(1).max(191),
  manualTrialToken: z.string().trim().min(1).max(191).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createChatMessageSchema = z.object({
  streamId: z.string().trim().min(1).max(191),
  message: z.string().trim().min(1).max(500),
  manualTrialToken: z.string().trim().min(1).max(191).optional(),
});

function endOfCurrentMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const parsed = listChatMessagesSchema.safeParse({
      streamId: searchParams.get("streamId"),
      manualTrialToken: searchParams.get("manualTrialToken") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
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

    const take = parsed.data.limit ?? 50;
    const rows = await prisma.chatMessage.findMany({
      where: { streamId: parsed.data.streamId },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        user: {
          select: { id: true, nickname: true, role: true },
        },
      },
    });

    const supporterUserIds = new Set(
      (
        await prisma.subscription.findMany({
          where: {
            userId: { in: [...new Set(rows.map((row) => row.userId))] },
            status: "ACTIVE",
            tierPriceCents: { gte: 9900 },
          },
          select: { userId: true },
          distinct: ["userId"],
        })
      ).map((row) => row.userId),
    );

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

    const messages = rows.reverse().map((row) => ({
      id: row.id,
      streamId: row.streamId,
      message: row.message,
      createdAt: row.createdAt,
      user: {
        ...row.user,
        nickname: supporterUserIds.has(row.user.id)
          ? `StudentSupporter ${row.user.nickname}`
          : row.user.nickname,
      },
    }));

    return NextResponse.json(
      {
        messages,
        permissions: permissionsWithManualTrial,
        stream: {
          id: stream.id,
          status: stream.status,
          startedAt: stream.startedAt,
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
      return NextResponse.json({ error: "Login required for chat" }, { status: 401 });
    }

    const parsed = createChatMessageSchema.safeParse(await request.json());
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
    const canSendText = permissions.canSendText || !!manualTrial;
    if (!canSendText) {
      return NextResponse.json(
        {
          error: permissions.reason ?? "Chat is locked for this stream.",
          permissions,
        },
        { status: 403 },
      );
    }

    const recentCount = await prisma.chatMessage.count({
      where: {
        streamId: stream.id,
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 10_000) },
      },
    });
    if (recentCount >= 5) {
      await prisma.adminTask.create({
        data: {
          type: "FLAG",
          status: "OPEN",
          createdById: user.id,
          payloadJson: {
            source: "chat_rate_limit",
            streamId: stream.id,
            message: parsed.data.message,
            submittedAt: new Date().toISOString(),
          },
        },
      });
      return NextResponse.json(
        { error: "Slow down. Too many messages sent too quickly." },
        { status: 429 },
      );
    }

    const blockedMatch = findBlockedChatContent({ message: parsed.data.message });
    if (blockedMatch) {
      const banResult = await prisma.$transaction(async (tx) => {
        const supportTasks = await tx.adminTask.findMany({
          where: {
            type: "SUPPORT",
          },
          select: { createdAt: true, payloadJson: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        });
        const lastAutoBanAt =
          supportTasks.find((task) => {
            const payload =
              task.payloadJson && typeof task.payloadJson === "object"
                ? (task.payloadJson as Record<string, unknown>)
                : null;
            return (
              payload?.source === "policy_auto_ban" &&
              payload?.targetUserId === user.id
            );
          })?.createdAt ?? null;

        await tx.adminTask.create({
          data: {
            type: "FLAG",
            status: "OPEN",
            createdById: user.id,
            payloadJson: {
              source: "chat_message_filter",
              streamId: stream.id,
              matchedField: blockedMatch.field,
              matchedTerm: blockedMatch.term,
              category: blockedMatch.category,
              message: parsed.data.message,
              submittedAt: new Date().toISOString(),
            },
          },
        });

        const allFlags = await tx.adminTask.findMany({
          where: {
            type: "FLAG",
            createdById: user.id,
            ...(lastAutoBanAt ? { createdAt: { gt: lastAutoBanAt } } : {}),
          },
          select: { payloadJson: true },
        });
        const strikeCount = allFlags.filter((flag) => {
          const payload =
            flag.payloadJson && typeof flag.payloadJson === "object"
              ? (flag.payloadJson as Record<string, unknown>)
              : null;
          return payload?.source === "chat_message_filter";
        }).length;

        const shouldBan = strikeCount >= 3;
        const bannedUntil = shouldBan ? endOfCurrentMonthUtc() : null;
        if (shouldBan) {
          await tx.user.update({
            where: { id: user.id },
            data: { bannedAt: bannedUntil },
          });
          await tx.adminTask.create({
            data: {
              type: "SUPPORT",
              status: "OPEN",
              createdById: null,
              payloadJson: {
                source: "policy_auto_ban",
                kind: "refund_review",
                message:
                  "Auto-ban after two warnings and one more violation. Manual refund/support review only.",
                targetUserId: user.id,
                targetEmail: user.email,
                targetNickname: user.nickname,
                triggeredByUserId: user.id,
                streamId: stream.id,
                bannedUntil: bannedUntil?.toISOString() ?? null,
                submittedAt: new Date().toISOString(),
              },
            },
          });
        }

        return {
          strikeCount,
          shouldBan,
          warningNumber: shouldBan ? 2 : Math.min(strikeCount, 2),
          bannedUntil: bannedUntil?.toISOString() ?? null,
        };
      });

      return NextResponse.json(
        {
          error: "Naughty naughty ban caution",
          moderation: {
            code: "POLICY_BLOCK",
            strikeCount: banResult.strikeCount,
            warningNumber: banResult.warningNumber,
            banned: banResult.shouldBan,
            bannedUntil: banResult.bannedUntil,
          },
        },
        { status: 400 },
      );
    }

    const created = await prisma.chatMessage.create({
      data: {
        streamId: parsed.data.streamId,
        userId: user.id,
        message: `<span>${sanitizeChatRichText(parsed.data.message)}</span>`,
      },
      include: {
        user: {
          select: { id: true, nickname: true, role: true },
        },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        message: {
          id: created.id,
          streamId: created.streamId,
          message: created.message,
          createdAt: created.createdAt,
          user: {
            ...created.user,
            nickname:
              permissions.scopedTierPriceCents && permissions.scopedTierPriceCents >= 9900
                ? `StudentSupporter ${created.user.nickname}`
                : created.user.nickname,
          },
        },
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
