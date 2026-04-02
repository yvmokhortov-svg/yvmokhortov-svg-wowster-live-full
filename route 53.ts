import { NextResponse } from "next/server";
import { z } from "zod";
import {
  Role,
  StreamRecordingStatus,
  StreamType,
} from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { expireRecordingsPastRetention } from "@/lib/recordings";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z
    .enum(["ALL", "PROCESSING", "READY", "FAILED", "EXPIRED"])
    .default("ALL"),
  type: z.enum(["ALL", "SCHOOL", "GUEST"]).default("ALL"),
  limit: z.number().int().min(1).max(500).default(120),
  runRetention: z.boolean().default(true),
});

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
      runRetention:
        searchParams.get("runRetention") == null
          ? undefined
          : searchParams.get("runRetention") === "true",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    if (parsed.data.runRetention) {
      await expireRecordingsPastRetention();
    }

    const rows = await prisma.streamRecording.findMany({
      where: {
        ...(parsed.data.status === "ALL"
          ? {}
          : { status: parsed.data.status as StreamRecordingStatus }),
        stream:
          parsed.data.type === "ALL"
            ? undefined
            : { type: parsed.data.type as StreamType },
      },
      orderBy: [{ recordedEndedAt: "desc" }, { createdAt: "desc" }],
      take: parsed.data.limit,
      select: {
        id: true,
        streamId: true,
        status: true,
        storageProvider: true,
        objectKey: true,
        downloadUrl: true,
        mimeType: true,
        sizeBytes: true,
        durationSeconds: true,
        recordedStartedAt: true,
        recordedEndedAt: true,
        availableAt: true,
        expiresAt: true,
        expiredAt: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
        stream: {
          select: {
            id: true,
            type: true,
            status: true,
            roomName: true,
            startedAt: true,
            endedAt: true,
            owner: {
              select: { id: true, email: true, nickname: true },
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
          },
        },
        _count: {
          select: { downloadAudits: true },
        },
      },
    });

    return NextResponse.json(
      {
        recordings: rows.map((row) => ({
          ...row,
          sizeBytes: row.sizeBytes !== null ? row.sizeBytes.toString() : null,
          canDownload: row.status === "READY" && !!row.downloadUrl,
          downloadCount: row._count.downloadAudits,
        })),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
