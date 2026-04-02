import { NextResponse } from "next/server";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const streamId = searchParams.get("streamId");
    const limitRaw = Number(searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, 500))
      : 100;

    const messages = await prisma.chatMessage.findMany({
      where: streamId ? { streamId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: {
          select: { id: true, email: true, nickname: true, role: true },
        },
        stream: {
          select: { id: true, type: true, roomName: true, status: true },
        },
      },
    });

    return NextResponse.json({ messages }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
