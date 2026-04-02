import { NextResponse } from "next/server";
import { z } from "zod";
import { Role, StreamStatus, StreamType } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["LIVE", "OFFLINE", "ENDED", "ALL"]).default("ALL"),
  type: z.enum(["SCHOOL", "GUEST", "ALL"]).default("ALL"),
  limit: z.number().int().min(1).max(500).default(100),
});

function computeDurationSeconds(input: {
  startedAt: Date | null;
  endedAt: Date | null;
  status: StreamStatus;
}): number | null {
  if (!input.startedAt) return null;
  const end = input.endedAt ?? (input.status === StreamStatus.LIVE ? new Date() : null);
  if (!end) return null;
  return Math.max(Math.floor((end.getTime() - input.startedAt.getTime()) / 1000), 0);
}

export async function GET(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const streams = await prisma.stream.findMany({
      where: {
        ...(parsed.data.status === "ALL"
          ? {}
          : { status: parsed.data.status as StreamStatus }),
        ...(parsed.data.type === "ALL"
          ? {}
          : { type: parsed.data.type as StreamType }),
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      take: parsed.data.limit,
      select: {
        id: true,
        type: true,
        status: true,
        roomName: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        owner: {
          select: { id: true, email: true, nickname: true, role: true },
        },
        class: {
          select: {
            id: true,
            level: true,
            dayPattern: true,
            time: true,
            lessonMinutes: true,
            house: { select: { name: true } },
            teacher: { select: { id: true, nickname: true } },
          },
        },
        recording: {
          select: {
            id: true,
            status: true,
            availableAt: true,
            expiresAt: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        streams: streams.map((row) => ({
          ...row,
          durationSeconds: computeDurationSeconds({
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            status: row.status,
          }),
        })),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
