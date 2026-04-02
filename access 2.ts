import { Role, type StreamType } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/current-user";
import { flags } from "@/config/flags";
import { prisma } from "@/lib/db";
import { isTrialWindowActive } from "@/lib/trial";

export type ChatPhase = "LESSON" | "QNA";

type StreamForChat = {
  id: string;
  type: StreamType;
  classId: string | null;
  ownerId: string;
  startedAt: Date | null;
  class: { lessonMinutes: number } | null;
};

export type ChatPermissions = {
  canRead: boolean;
  canSendText: boolean;
  canSendEconomy: boolean;
  phase: ChatPhase;
  reason: string | null;
  hasScopedSubscription: boolean;
  hasActiveGrant: boolean;
  hasTrialAttendance: boolean;
  scopedTierPriceCents: number | null;
};

function resolvePhase(stream: StreamForChat): ChatPhase {
  if (stream.type !== "SCHOOL") return "LESSON";
  if (!stream.startedAt || !stream.class?.lessonMinutes) return "LESSON";
  const lessonEndsAt = stream.startedAt.getTime() + stream.class.lessonMinutes * 60_000;
  return Date.now() >= lessonEndsAt ? "QNA" : "LESSON";
}

function isPrivilegedRole(user: CurrentUser, stream: StreamForChat): boolean {
  if (user.role === Role.ADMIN) return true;
  // Stream owner (typically teacher/guest) can always send in own room.
  if (user.id === stream.ownerId) return true;
  return false;
}

export async function resolveChatPermissions(params: {
  user: CurrentUser | null;
  stream: StreamForChat;
}): Promise<ChatPermissions> {
  const phase = resolvePhase(params.stream);

  if (params.stream.type === "GUEST") {
    if (!params.user) {
      return {
        canRead: true,
        canSendText: false,
        canSendEconomy: false,
        phase,
        reason: "Login required for chat, stickers, gifts, and tips.",
        hasScopedSubscription: false,
        hasActiveGrant: false,
        hasTrialAttendance: false,
        scopedTierPriceCents: null,
      };
    }

    return {
      canRead: true,
      canSendText: true,
      canSendEconomy: true,
      phase,
      reason: null,
      hasScopedSubscription: false,
      hasActiveGrant: false,
      hasTrialAttendance: false,
      scopedTierPriceCents: null,
    };
  }

  // School stream.
  if (!params.user) {
    return {
      canRead: true,
      canSendText: false,
      canSendEconomy: false,
      phase,
      reason: "Login and choose trial or subscription to chat in school streams.",
      hasScopedSubscription: false,
      hasActiveGrant: false,
      hasTrialAttendance: false,
      scopedTierPriceCents: null,
    };
  }

  if (isPrivilegedRole(params.user, params.stream)) {
    return {
      canRead: true,
      canSendText: true,
      canSendEconomy: true,
      phase,
      reason: null,
      hasScopedSubscription: false,
      hasActiveGrant: false,
      hasTrialAttendance: false,
      scopedTierPriceCents: null,
    };
  }

  const [activeSubscriptions, grants, trialAttendance] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        userId: params.user.id,
        status: "ACTIVE",
      },
      select: { id: true, classId: true, tierPriceCents: true },
      orderBy: { createdAt: "asc" },
    }),
    flags.grantsFeatureEnabled
      ? prisma.accountGrant.findMany({
          where: {
            userId: params.user.id,
            active: true,
            type: "FREE_LESSONS",
          },
          select: { lessonLimit: true, lessonsUsed: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    prisma.trialAttendance.findUnique({
      where: {
        userId_streamId: {
          userId: params.user.id,
          streamId: params.stream.id,
        },
      },
      select: { createdAt: true },
    }),
  ]);

  const scopedSubscription = params.stream.classId
    ? (activeSubscriptions.find((s) => s.classId === params.stream.classId) ?? null)
    : (activeSubscriptions[0] ?? null);
  const hasScopedSubscription = !!scopedSubscription;
  const scopedTierPriceCents = scopedSubscription?.tierPriceCents ?? null;
  const hasActiveGrant = grants.some((grant) => grant.lessonsUsed < grant.lessonLimit);
  const hasTrialAttendance = !!(
    trialAttendance && isTrialWindowActive(trialAttendance.createdAt)
  );

  const hasBaseSchoolAccess =
    hasScopedSubscription || hasActiveGrant || hasTrialAttendance;

  if (!hasBaseSchoolAccess) {
    return {
      canRead: true,
      canSendText: false,
      canSendEconomy: false,
      phase,
      reason: "School stream chat is locked. Use trial or subscribe.",
      hasScopedSubscription,
      hasActiveGrant,
      hasTrialAttendance,
      scopedTierPriceCents,
    };
  }

  const hasQnaChatAccess =
    hasTrialAttendance ||
    hasActiveGrant ||
    (hasScopedSubscription && (scopedTierPriceCents ?? 0) >= 3500);

  if (phase === "QNA" && !hasQnaChatAccess) {
    return {
      canRead: true,
      canSendText: false,
      canSendEconomy: false,
      phase,
      reason: "Q&A chat is read-only on your plan. Upgrade +$10 to join Q&A.",
      hasScopedSubscription,
      hasActiveGrant,
      hasTrialAttendance,
      scopedTierPriceCents,
    };
  }

  return {
    canRead: true,
    canSendText: true,
    canSendEconomy: true,
    phase,
    reason: null,
    hasScopedSubscription,
    hasActiveGrant,
    hasTrialAttendance,
    scopedTierPriceCents,
  };
}
