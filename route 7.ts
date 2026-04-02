import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ensureProcessingRecordingForEndedStream } from "@/lib/recordings";

export const runtime = "nodejs";

const endStreamSchema = z.object({
  streamId: z.string().trim().min(1).max(191),
});

export async function POST(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = endStreamSchema.safeParse(await request.json());
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
        ownerId: true,
        status: true,
        type: true,
        startedAt: true,
        createdAt: true,
      },
    });
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const canEnd =
      actor.role === Role.ADMIN ||
      actor.id === stream.ownerId;
    if (!canEnd) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (stream.status !== "LIVE") {
      return NextResponse.json(
        { error: "Stream is already not live", status: stream.status },
        { status: 409 },
      );
    }

    const updated = await prisma.stream.update({
      where: { id: stream.id },
      data: {
        status: "ENDED",
        endedAt: new Date(),
      },
      select: {
        id: true,
        type: true,
        status: true,
        endedAt: true,
        startedAt: true,
        createdAt: true,
      },
    });

    const recording = await ensureProcessingRecordingForEndedStream({
      streamId: updated.id,
      startedAt: updated.startedAt,
      endedAt: updated.endedAt,
      createdAt: updated.createdAt,
    });

    return NextResponse.json({ ok: true, stream: updated, recording }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
