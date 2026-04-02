import { NextResponse } from "next/server";
import { flags } from "@/config/flags";
import { resolveSchoolAccess } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { resolveActiveManualTrialToken } from "@/lib/manual-trials";
import { isTrialWindowActive, trialEndsAtIso } from "@/lib/trial";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const streamId = searchParams.get("streamId");
    const manualTrialToken = searchParams.get("manualTrialToken");
    const user = await getCurrentUser();
    if (!user) {
      const manualTrial =
        streamId && manualTrialToken
          ? await resolveActiveManualTrialToken({
              token: manualTrialToken,
              streamId,
            })
          : null;
      return NextResponse.json(
        {
          user: null,
          manualTrial: manualTrial
            ? {
                id: manualTrial.id,
                startsAt: manualTrial.startsAt,
                endsAt: manualTrial.endsAt,
                timezone: manualTrial.timezone,
                roomLink: manualTrial.roomLink,
              }
            : null,
          access: manualTrial
            ? {
                tier: "trial",
                canWatchSchoolStream: true,
                canUseQnA: false,
                canSendChat: false,
                reason: "Manual trial assignment active",
              }
            : null,
        },
        { status: 200 },
      );
    }

    const classIdParam = searchParams.get("classId");
    let scopedClassId: string | null = classIdParam;
    let scopedStreamType: "SCHOOL" | "GUEST" | null = null;

    if (streamId) {
      const stream = await prisma.stream.findUnique({
        where: { id: streamId },
        select: { id: true, type: true, classId: true },
      });
      scopedStreamType = stream?.type ?? null;
      if (stream?.type === "SCHOOL") {
        scopedClassId = stream.classId ?? scopedClassId;
      } else if (stream?.type === "GUEST") {
        scopedClassId = null;
      }
    }

    const activeSubscriptions = await prisma.subscription.findMany({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
      select: { id: true, tierPriceCents: true, classId: true, switchUsedThisCycle: true },
      orderBy: { createdAt: "asc" },
    });
    const activeSubscription = scopedClassId
      ? (activeSubscriptions.find((s) => s.classId === scopedClassId) ?? null)
      : (activeSubscriptions[0] ?? null);
    const hasScopedSubscription =
      scopedClassId === null
        ? activeSubscriptions.length > 0
        : !!activeSubscription;

    const grants = flags.grantsFeatureEnabled
      ? await prisma.accountGrant.findMany({
          where: {
            userId: user.id,
            active: true,
            type: "FREE_LESSONS",
          },
          select: { id: true, lessonLimit: true, lessonsUsed: true, reason: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : [];
    const activeGrant =
      grants.find((g) => g.lessonsUsed < g.lessonLimit) ?? null;

    const userDb = await prisma.user.findUnique({
      where: { id: user.id },
      select: { trialAttendedCount: true },
    });
    const trialAttendance = streamId
      ? await prisma.trialAttendance.findUnique({
          where: {
            userId_streamId: {
              userId: user.id,
              streamId,
            },
          },
          select: { createdAt: true },
        })
      : null;
    const activeStreamTrial = !!(
      trialAttendance && isTrialWindowActive(trialAttendance.createdAt)
    );

    const access = resolveSchoolAccess({
      hasActiveSubscription: hasScopedSubscription,
      hasActiveGrant: !!activeGrant,
      trialAttendedCount: flags.trialEnabled
        ? (userDb?.trialAttendedCount ?? 0)
        : Number.MAX_SAFE_INTEGER,
    });
    const manualTrial =
      streamId && manualTrialToken
        ? await resolveActiveManualTrialToken({
            token: manualTrialToken,
            streamId,
          })
        : null;
    const trialAttendedCount = userDb?.trialAttendedCount ?? 0;
    const accessWithManualTrial =
      streamId && scopedStreamType === "SCHOOL"
        ? manualTrial
          ? {
              ...access,
              tier: "trial" as const,
              canWatchSchoolStream: true,
              canUseQnA: true,
              canSendChat: true,
              reason: "Manual trial assignment active",
            }
          : hasScopedSubscription || !!activeGrant
            ? {
                ...access,
                tier: "subscription" as const,
                canWatchSchoolStream: true,
                canUseQnA: true,
                canSendChat: true,
                reason: hasScopedSubscription
                  ? "Active subscription"
                  : "Active account grant",
              }
            : activeStreamTrial
              ? {
                  ...access,
                  tier: "trial" as const,
                  canWatchSchoolStream: true,
                  canUseQnA: true,
                  canSendChat: true,
                  reason: "20-minute trial session active",
                }
              : {
                  ...access,
                  tier: "none" as const,
                  canWatchSchoolStream: false,
                  canUseQnA: false,
                  canSendChat: false,
                  reason:
                    trialAttendedCount >= 2
                      ? "Trial exhausted. Subscribe to continue."
                      : "Trial available. Start 20-minute trial.",
                }
        : manualTrial
          ? {
              ...access,
              tier: "trial" as const,
              canWatchSchoolStream: true,
              canUseQnA: true,
              canSendChat: true,
              reason: "Manual trial assignment active",
            }
          : access;

    return NextResponse.json(
      {
        user,
        flags,
        scope: {
          streamId,
          streamType: scopedStreamType,
          classId: scopedClassId,
          hasScopedSubscription,
        },
        activeSubscriptionsCount: activeSubscriptions.length,
        activeSubscription,
        activeGrant: activeGrant
          ? {
              ...activeGrant,
              lessonsRemaining: Math.max(
                activeGrant.lessonLimit - activeGrant.lessonsUsed,
                0,
              ),
            }
          : null,
        manualTrial: manualTrial
          ? {
              id: manualTrial.id,
              startsAt: manualTrial.startsAt,
              endsAt: manualTrial.endsAt,
              timezone: manualTrial.timezone,
              roomLink: manualTrial.roomLink,
            }
          : null,
        trial: {
          trialAttendedCount,
          trialRemaining: Math.max(2 - trialAttendedCount, 0),
          activeForStream: activeStreamTrial,
          trialEndsAt: trialAttendance ? trialEndsAtIso(trialAttendance.createdAt) : null,
        },
        access: accessWithManualTrial,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
