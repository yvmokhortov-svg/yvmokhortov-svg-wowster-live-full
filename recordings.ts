import { prisma } from "@/lib/db";

export const RECORDING_RETENTION_DAYS = 30;
export const RECORDING_RETENTION_MS = RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function computeRecordingDurationSeconds(
  startedAt: Date | null,
  endedAt: Date | null,
): number | null {
  if (!startedAt || !endedAt) return null;
  return Math.max(Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000), 0);
}

export function computeRecordingExpiresAt(endedAt: Date): Date {
  return new Date(endedAt.getTime() + RECORDING_RETENTION_MS);
}

export async function ensureProcessingRecordingForEndedStream(input: {
  streamId: string;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}) {
  const endedAt = input.endedAt ?? new Date();
  const startedAt = input.startedAt ?? input.createdAt;
  const durationSeconds = computeRecordingDurationSeconds(startedAt, endedAt);
  const expiresAt = computeRecordingExpiresAt(endedAt);

  return prisma.streamRecording.upsert({
    where: { streamId: input.streamId },
    create: {
      streamId: input.streamId,
      status: "PROCESSING",
      recordedStartedAt: startedAt,
      recordedEndedAt: endedAt,
      durationSeconds,
      expiresAt,
    },
    update: {
      status: "PROCESSING",
      recordedStartedAt: startedAt,
      recordedEndedAt: endedAt,
      durationSeconds,
      expiresAt,
      availableAt: null,
      expiredAt: null,
      downloadUrl: null,
      objectKey: null,
      mimeType: null,
      sizeBytes: null,
      failureReason: null,
    },
  });
}

export async function expireRecordingsPastRetention(now = new Date()): Promise<{
  expiredCount: number;
}> {
  const expiredRows = await prisma.streamRecording.findMany({
    where: {
      status: { not: "EXPIRED" },
      expiresAt: { lte: now },
    },
    select: { id: true, streamId: true },
    take: 2000,
  });

  if (!expiredRows.length) return { expiredCount: 0 };

  const recordingIds = expiredRows.map((row) => row.id);
  const streamIds = expiredRows.map((row) => row.streamId);

  const [expiredResult] = await prisma.$transaction([
    prisma.streamRecording.updateMany({
      where: { id: { in: recordingIds } },
      data: {
        status: "EXPIRED",
        expiredAt: now,
        availableAt: null,
        downloadUrl: null,
      },
    }),
    prisma.stream.updateMany({
      where: { id: { in: streamIds } },
      data: { recordingUrl: null },
    }),
  ]);

  return { expiredCount: expiredResult.count };
}
