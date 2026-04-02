import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const querySchema = z.object({
  targetType: z.enum(["PROFILE", "GRADUATION_WORK"]),
  targetId: z.string().trim().min(1).max(191).optional(),
  targetIds: z.string().trim().min(1).max(5000).optional(),
});

const mutationSchema = z.object({
  targetType: z.enum(["PROFILE", "GRADUATION_WORK"]),
  targetId: z.string().trim().min(1).max(191),
  action: z.enum(["like", "unlike"]).default("like"),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      targetType: searchParams.get("targetType"),
      targetId: searchParams.get("targetId") ?? undefined,
      targetIds: searchParams.get("targetIds") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const targetIds = (
      parsed.data.targetIds
        ? parsed.data.targetIds
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : []
    ).slice(0, 100);
    if (parsed.data.targetId) targetIds.push(parsed.data.targetId);

    if (!targetIds.length) {
      return NextResponse.json({ likes: [], byTargetId: {} }, { status: 200 });
    }

    const likes = await prisma.like.findMany({
      where: {
        targetType: parsed.data.targetType,
        targetId: { in: [...new Set(targetIds)] },
      },
      select: {
        id: true,
        targetId: true,
        targetType: true,
        createdAt: true,
        liker: {
          select: {
            id: true,
            nickname: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const byTargetId = likes.reduce<
      Record<
        string,
        Array<{
          id: string;
          createdAt: Date;
          liker: { id: string; nickname: string; role: string; isTeacher: boolean };
        }>
      >
    >((acc, like) => {
      if (!acc[like.targetId]) acc[like.targetId] = [];
      acc[like.targetId].push({
        id: like.id,
        createdAt: like.createdAt,
        liker: {
          id: like.liker.id,
          nickname: like.liker.nickname,
          role: like.liker.role,
          isTeacher: like.liker.role === "TEACHER",
        },
      });
      return acc;
    }, {});

    return NextResponse.json({ likes, byTargetId }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = mutationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    if (parsed.data.action === "unlike") {
      await prisma.like.deleteMany({
        where: {
          likerUserId: user.id,
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
        },
      });
      return NextResponse.json({ ok: true, liked: false }, { status: 200 });
    }

    await prisma.like.upsert({
      where: {
        likerUserId_targetType_targetId: {
          likerUserId: user.id,
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
        },
      },
      create: {
        likerUserId: user.id,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
      },
      update: {},
    });

    return NextResponse.json({ ok: true, liked: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
