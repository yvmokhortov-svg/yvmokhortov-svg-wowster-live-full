import { prisma } from "@/lib/db";

type JsonObject = Record<string, unknown>;

export type ManualTrialAssignment = {
  id: string;
  status: "OPEN" | "CLOSED";
  token: string;
  streamId: string;
  streamType: "SCHOOL" | "GUEST";
  startsAt: string;
  endsAt: string;
  timezone: string;
  durationMinutes: number;
  note: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    email: string;
    nickname: string;
  } | null;
  roomLink: string;
};

function parsePayload(payload: unknown): JsonObject | null {
  if (!payload || typeof payload !== "object") return null;
  return payload as JsonObject;
}

function parseAssignmentFromTask(task: {
  id: string;
  status: "OPEN" | "CLOSED";
  createdAt: Date;
  payloadJson: unknown;
  createdBy: { id: string; email: string; nickname: string } | null;
}): ManualTrialAssignment | null {
  const payload = parsePayload(task.payloadJson);
  if (!payload) return null;
  if (payload.source !== "manual_trial_assignment") return null;

  const token = typeof payload.token === "string" ? payload.token : null;
  const streamId = typeof payload.streamId === "string" ? payload.streamId : null;
  const streamType = payload.streamType === "GUEST" ? "GUEST" : "SCHOOL";
  const startsAt = typeof payload.startsAt === "string" ? payload.startsAt : null;
  const endsAt = typeof payload.endsAt === "string" ? payload.endsAt : null;
  const timezone = typeof payload.timezone === "string" ? payload.timezone : "UTC";
  const durationMinutes =
    typeof payload.durationMinutes === "number" && Number.isFinite(payload.durationMinutes)
      ? payload.durationMinutes
      : 20;
  const roomLink = typeof payload.roomLink === "string" ? payload.roomLink : null;
  const note = typeof payload.note === "string" ? payload.note : null;

  if (!token || !streamId || !startsAt || !endsAt || !roomLink) return null;

  return {
    id: task.id,
    status: task.status,
    token,
    streamId,
    streamType,
    startsAt,
    endsAt,
    timezone,
    durationMinutes,
    note,
    createdAt: task.createdAt.toISOString(),
    createdBy: task.createdBy,
    roomLink,
  };
}

export function isManualTrialAssignmentActive(assignment: ManualTrialAssignment): boolean {
  if (assignment.status !== "OPEN") return false;
  const startMs = new Date(assignment.startsAt).getTime();
  const endMs = new Date(assignment.endsAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  const now = Date.now();
  return now >= startMs && now <= endMs;
}

export async function listManualTrialAssignments(limit = 500): Promise<ManualTrialAssignment[]> {
  const tasks = await prisma.adminTask.findMany({
    where: { type: "SUPPORT" },
    include: {
      createdBy: {
        select: { id: true, email: true, nickname: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return tasks
    .map((task) =>
      parseAssignmentFromTask({
        id: task.id,
        status: task.status,
        createdAt: task.createdAt,
        payloadJson: task.payloadJson,
        createdBy: task.createdBy,
      }),
    )
    .filter((value): value is ManualTrialAssignment => !!value);
}

export async function resolveActiveManualTrialToken(input: {
  token: string;
  streamId?: string | null;
}): Promise<ManualTrialAssignment | null> {
  const assignments = await listManualTrialAssignments(600);
  const match = assignments.find((assignment) => assignment.token === input.token);
  if (!match) return null;
  if (input.streamId && match.streamId !== input.streamId) return null;
  if (!isManualTrialAssignmentActive(match)) return null;
  return match;
}
