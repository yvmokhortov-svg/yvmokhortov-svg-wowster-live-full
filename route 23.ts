import { NextResponse } from "next/server";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== Role.TEACHER && user.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const uploads = await prisma.upload.findMany({
      where:
        user.role === Role.ADMIN
          ? {}
          : {
              class: {
                teacherId: user.id,
              },
            },
      select: {
        id: true,
        slotIndex: true,
        imageUrl: true,
        feedbackText: true,
        tasksText: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            nickname: true,
            email: true,
          },
        },
        class: {
          select: {
            id: true,
            dayPattern: true,
            time: true,
            teacherId: true,
            teacher: { select: { id: true, nickname: true } },
            level: true,
            house: { select: { name: true } },
          },
        },
        subscription: {
          select: {
            id: true,
            tierPriceCents: true,
            status: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 300,
    });

    return NextResponse.json({ uploads }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
