import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listManualTrialAssignments } from "@/lib/manual-trials";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const createManualTrialSchema = z.object({
  streamId: z.string().trim().min(1).max(191),
  startsAt: z.string().datetime(),
  timezone: z.string().trim().min(2).max(120),
  note: z.string().trim().max(400).optional(),
});

export async function GET() {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const assignments = await listManualTrialAssignments(500);
    return NextResponse.json(
      {
        assignments: assignments.map((assignment) => ({
          ...assignment,
          activeNow: (() => {
            const now = Date.now();
            const startMs = new Date(assignment.startsAt).getTime();
            const endMs = new Date(assignment.endsAt).getTime();
            return assignment.status === "OPEN" && now >= startMs && now <= endMs;
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
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = createManualTrialSchema.safeParse(await request.json());
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
        owner: { select: { id: true, nickname: true, email: true } },
      },
    });
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const startsAt = new Date(parsed.data.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: "Invalid startsAt" }, { status: 400 });
    }
    const endsAt = new Date(startsAt.getTime() + 20 * 60_000);
    const token = randomUUID();
    const roomLink = `/live-room?streamId=${encodeURIComponent(stream.id)}&manualTrialToken=${encodeURIComponent(token)}`;

    const task = await prisma.adminTask.create({
      data: {
        type: "SUPPORT",
        status: "OPEN",
        createdById: actor.id,
        payloadJson: {
          source: "manual_trial_assignment",
          token,
          streamId: stream.id,
          streamType: stream.type,
          teacherId: stream.owner.id,
          teacherNickname: stream.owner.nickname,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          durationMinutes: 20,
          timezone: parsed.data.timezone,
          note: parsed.data.note ?? null,
          roomLink,
          submittedAt: new Date().toISOString(),
        },
      },
      select: { id: true, createdAt: true },
    });

    return NextResponse.json(
      {
        assignment: {
          id: task.id,
          streamId: stream.id,
          streamType: stream.type,
          teacherId: stream.owner.id,
          teacherNickname: stream.owner.nickname,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          durationMinutes: 20,
          timezone: parsed.data.timezone,
          note: parsed.data.note ?? null,
          token,
          roomLink,
          createdAt: task.createdAt,
        },
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
