import { NextResponse } from "next/server";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function resolveIpAddress(request: Request): string | null {
  const directIp = request.headers.get("x-real-ip");
  if (directIp) return directIp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const recording = await prisma.streamRecording.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        downloadUrl: true,
      },
    });
    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }
    if (recording.status !== "READY" || !recording.downloadUrl) {
      return NextResponse.json(
        { error: "Recording is not available for download." },
        { status: 409 },
      );
    }

    await prisma.recordingDownloadAudit.create({
      data: {
        recordingId: recording.id,
        adminUserId: actor.id,
        ipAddress: resolveIpAddress(request),
        userAgent: request.headers.get("user-agent"),
      },
      select: { id: true },
    });

    return NextResponse.redirect(recording.downloadUrl, { status: 302 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
