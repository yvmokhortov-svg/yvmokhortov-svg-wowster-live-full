import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { isTrialWindowActive, trialEndsAtIso } from "@/lib/trial";

export const runtime = "nodejs";

type Payload = {
  streamId: string;
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as Partial<Payload>;
    if (!body.streamId) {
      return NextResponse.json({ error: "streamId required" }, { status: 400 });
    }
    const streamId = body.streamId;

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { id: true, type: true },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }
    if (stream.type !== "SCHOOL") {
      return NextResponse.json({ error: "Trial applies to school streams only" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const alreadyCounted = await tx.trialAttendance.findUnique({
        where: {
          userId_streamId: {
            userId: user.id,
            streamId,
          },
        },
      });

      if (alreadyCounted) {
        const existingUser = await tx.user.findUnique({
          where: { id: user.id },
          select: { trialAttendedCount: true },
        });
        const activeWindow = isTrialWindowActive(alreadyCounted.createdAt);
        return {
          alreadyCounted: true,
          activeWindow,
          trialEndsAt: trialEndsAtIso(alreadyCounted.createdAt),
          trialAttendedCount: existingUser?.trialAttendedCount ?? 0,
        };
      }

      const existingUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { trialAttendedCount: true },
      });
      const trialCount = existingUser?.trialAttendedCount ?? 0;
      if (trialCount >= 2) {
        return {
          exhausted: true,
          alreadyCounted: false,
          trialAttendedCount: trialCount,
        };
      }

      const createdAttendance = await tx.trialAttendance.create({
        data: {
          userId: user.id,
          streamId,
        },
      });

      const updated = await tx.user.update({
        where: { id: user.id },
        data: { trialAttendedCount: { increment: 1 } },
        select: { trialAttendedCount: true },
      });

      return {
        exhausted: false,
        alreadyCounted: false,
        activeWindow: true,
        trialEndsAt: trialEndsAtIso(createdAttendance.createdAt),
        trialAttendedCount: updated.trialAttendedCount,
      };
    });

    if (result.exhausted) {
      return NextResponse.json(
        {
          error: "Trial exhausted. Please subscribe.",
          trialAttendedCount: result.trialAttendedCount,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        alreadyCounted: result.alreadyCounted,
        activeWindow: result.activeWindow,
        trialEndsAt: result.trialEndsAt,
        trialAttendedCount: result.trialAttendedCount,
        trialRemaining: Math.max(2 - result.trialAttendedCount, 0),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
