import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const createBanSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z.email().toLowerCase().optional(),
    bannedUntil: z.string().datetime().optional(),
    permanent: z.boolean().optional(),
    reason: z.string().trim().max(400).optional(),
  })
  .refine((data) => data.userId || data.email, {
    message: "Provide userId or email",
    path: ["userId"],
  });

const patchBanSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z.email().toLowerCase().optional(),
    clear: z.boolean().optional(),
    bannedUntil: z.string().datetime().optional(),
    permanent: z.boolean().optional(),
    reason: z.string().trim().max(400).optional(),
  })
  .refine((data) => data.userId || data.email, {
    message: "Provide userId or email",
    path: ["userId"],
  });

function endOfCurrentMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

const PERMANENT_BAN_UNTIL = new Date("9999-12-31T23:59:59.999Z");

function isPermanentBanDate(value: Date | null): boolean {
  if (!value) return false;
  return value.getUTCFullYear() >= 9999;
}

function resolveBanUntil(input: {
  clear?: boolean;
  permanent?: boolean;
  bannedUntil?: string;
}): Date | null {
  if (input.clear) return null;
  if (input.permanent) return PERMANENT_BAN_UNTIL;
  if (input.bannedUntil) return new Date(input.bannedUntil);
  return endOfCurrentMonthUtc();
}

async function requireAdmin() {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== Role.ADMIN) return null;
  return actor;
}

async function resolveTargetUser(input: { userId?: string; email?: string }) {
  if (input.userId) {
    return prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, nickname: true, role: true, bannedAt: true },
    });
  }
  if (input.email) {
    return prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, nickname: true, role: true, bannedAt: true },
    });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const actor = await requireAdmin();
    if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const includeCancelled =
      (searchParams.get("includeCancelled") ?? searchParams.get("includeExpired") ?? "false") ===
      "true";

    const bans = await prisma.user.findMany({
      where: {
        bannedAt: includeCancelled ? { not: null } : { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        bannedAt: true,
      },
      orderBy: { bannedAt: "desc" },
      take: 200,
    });

    const bannedUserIds = new Set(bans.map((row) => row.id));
    const banAuditTasks = await prisma.adminTask.findMany({
      where: { type: "SUPPORT" },
      include: {
        createdBy: {
          select: { id: true, email: true, nickname: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    const latestBanEventByUserId = new Map<
      string,
      {
        source: string | null;
        reason: string | null;
        bannedUntil: string | null;
        createdAt: Date;
        createdBy: { id: string; email: string; nickname: string } | null;
      }
    >();
    for (const task of banAuditTasks) {
      const payload =
        task.payloadJson && typeof task.payloadJson === "object"
          ? (task.payloadJson as Record<string, unknown>)
          : null;
      const source = typeof payload?.source === "string" ? payload.source : null;
      if (
        !source ||
        !["admin_manual_ban", "admin_manual_ban_update", "policy_auto_ban"].includes(source)
      ) {
        continue;
      }
      const targetUserId =
        typeof payload?.targetUserId === "string" ? payload.targetUserId : null;
      if (!targetUserId || !bannedUserIds.has(targetUserId)) continue;
      if (latestBanEventByUserId.has(targetUserId)) continue;

      latestBanEventByUserId.set(targetUserId, {
        source,
        reason: typeof payload?.reason === "string" ? payload.reason : null,
        bannedUntil:
          typeof payload?.bannedUntil === "string" ? payload.bannedUntil : null,
        createdAt: task.createdAt,
        createdBy: task.createdBy,
      });
    }

    return NextResponse.json(
      {
        bans: bans.map((row) => ({
          ...row,
          active: !!row.bannedAt && row.bannedAt > new Date(),
          status:
            row.bannedAt && row.bannedAt > new Date() ? "BANNED" : "CANCELLED",
          isPermanent: isPermanentBanDate(row.bannedAt),
          banMeta: (() => {
            const event = latestBanEventByUserId.get(row.id);
            if (!event) {
              return {
                source: null,
                reason: null,
                bannedBy: null,
                createdAt: null,
              };
            }
            return {
              source: event.source,
              reason: event.reason,
              createdAt: event.createdAt.toISOString(),
              bannedBy:
                event.source === "policy_auto_ban"
                  ? {
                      id: null,
                      email: null,
                      nickname: "System policy",
                    }
                  : event.createdBy
                    ? {
                        id: event.createdBy.id,
                        email: event.createdBy.email,
                        nickname: event.createdBy.nickname,
                      }
                    : {
                        id: null,
                        email: null,
                        nickname: "Unknown admin",
                      },
            };
          })(),
        })),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = createBanSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const target = await resolveTargetUser(parsed.data);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const bannedUntil = resolveBanUntil({
      bannedUntil: parsed.data.bannedUntil,
      permanent: parsed.data.permanent,
    });
    if (!bannedUntil || Number.isNaN(bannedUntil.getTime()) || bannedUntil <= new Date()) {
      return NextResponse.json(
        { error: "bannedUntil must be a future date/time" },
        { status: 400 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: { bannedAt: bannedUntil },
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          bannedAt: true,
        },
      });

      await tx.adminTask.create({
        data: {
          type: "SUPPORT",
          status: "OPEN",
          createdById: actor.id,
          payloadJson: {
            source: "admin_manual_ban",
            targetUserId: target.id,
            targetEmail: target.email,
            targetNickname: target.nickname,
            bannedUntil: bannedUntil.toISOString(),
            permanent: isPermanentBanDate(bannedUntil),
            reason: parsed.data.reason ?? null,
            submittedAt: new Date().toISOString(),
          },
        },
      });

      return user;
    });

    return NextResponse.json({ bannedUser: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdmin();
    if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = patchBanSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const target = await resolveTargetUser(parsed.data);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const clear = parsed.data.clear === true;
    const bannedUntil = resolveBanUntil({
      clear,
      bannedUntil: parsed.data.bannedUntil,
      permanent: parsed.data.permanent,
    });

    if (bannedUntil && (Number.isNaN(bannedUntil.getTime()) || bannedUntil <= new Date())) {
      return NextResponse.json(
        { error: "bannedUntil must be a future date/time" },
        { status: 400 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: { bannedAt: bannedUntil },
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          bannedAt: true,
        },
      });

      await tx.adminTask.create({
        data: {
          type: "SUPPORT",
          status: "OPEN",
          createdById: actor.id,
          payloadJson: {
            source: clear ? "admin_manual_unban" : "admin_manual_ban_update",
            targetUserId: target.id,
            targetEmail: target.email,
            targetNickname: target.nickname,
            bannedUntil: bannedUntil?.toISOString() ?? null,
            permanent: isPermanentBanDate(bannedUntil),
            reason: parsed.data.reason ?? null,
            submittedAt: new Date().toISOString(),
          },
        },
      });

      return user;
    });

    return NextResponse.json({ bannedUser: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
