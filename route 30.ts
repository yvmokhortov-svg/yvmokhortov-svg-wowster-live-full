import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import {
  computeRecordingDurationSeconds,
  computeRecordingExpiresAt,
} from "@/lib/recordings";

export const runtime = "nodejs";

const finalizeSchema = z.object({
  streamId: z.string().trim().min(1).max(191),
  status: z.enum(["READY", "FAILED"]).default("READY"),
  downloadUrl: z.string().url().max(2048).optional(),
  objectKey: z.string().trim().min(1).max(512).optional(),
  mimeType: z.string().trim().min(1).max(191).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  failureReason: z.string().trim().min(1).max(1000).optional(),
  completedAt: z.coerce.date().optional(),
});

export async function POST(request: Request) {
  try {
    const systemToken = process.env.RECORDING_FINALIZE_TOKEN;
    const requestToken = request.headers.get("x-recording-token");
    const systemAuthorized = !!systemToken && !!requestToken && systemToken === requestToken;

    const actor = systemAuthorized ? null : await getCurrentUser();
    if (!systemAuthorized && !actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = finalizeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    if (parsed.data.status === "READY" && !parsed.data.downloadUrl) {
      return NextResponse.json(
        { error: "downloadUrl is required for READY status." },
        { status: 400 },
      );
    }

    const stream = await prisma.stream.findUnique({
      where: { id: parsed.data.streamId },
      select: {
        id: true,
        ownerId: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
      },
    });
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    if (
      actor &&
      actor.role !== Role.ADMIN &&
      actor.id !== stream.ownerId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const completedAt = parsed.data.completedAt ?? new Date();
    const recordedEndedAt = stream.endedAt ?? completedAt;
    const recordedStartedAt = stream.startedAt ?? stream.createdAt;
    const durationSeconds = computeRecordingDurationSeconds(
      recordedStartedAt,
      recordedEndedAt,
    );
    const expiresAt = computeRecordingExpiresAt(recordedEndedAt);

    const recording = await prisma.streamRecording.upsert({
      where: { streamId: stream.id },
      create: {
        streamId: stream.id,
        status: parsed.data.status,
        downloadUrl:
          parsed.data.status === "READY" ? (parsed.data.downloadUrl ?? null) : null,
        objectKey: parsed.data.objectKey ?? null,
        mimeType: parsed.data.mimeType ?? null,
        sizeBytes:
          typeof parsed.data.sizeBytes === "number"
            ? BigInt(parsed.data.sizeBytes)
            : null,
        failureReason:
          parsed.data.status === "FAILED" ? (parsed.data.failureReason ?? null) : null,
        recordedStartedAt,
        recordedEndedAt,
        durationSeconds,
        availableAt: parsed.data.status === "READY" ? completedAt : null,
        expiresAt,
      },
      update: {
        status: parsed.data.status,
        downloadUrl:
          parsed.data.status === "READY" ? (parsed.data.downloadUrl ?? null) : null,
        objectKey: parsed.data.objectKey ?? null,
        mimeType: parsed.data.mimeType ?? null,
        sizeBytes:
          typeof parsed.data.sizeBytes === "number"
            ? BigInt(parsed.data.sizeBytes)
            : null,
        failureReason:
          parsed.data.status === "FAILED" ? (parsed.data.failureReason ?? null) : null,
        recordedStartedAt,
        recordedEndedAt,
        durationSeconds,
        availableAt: parsed.data.status === "READY" ? completedAt : null,
        expiredAt: null,
        expiresAt,
      },
      select: {
        id: true,
        streamId: true,
        status: true,
        downloadUrl: true,
        expiresAt: true,
        durationSeconds: true,
      },
    });

    await prisma.stream.update({
      where: { id: stream.id },
      data: {
        recordingUrl:
          parsed.data.status === "READY" ? (parsed.data.downloadUrl ?? null) : null,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, recording }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
