import { NextResponse } from "next/server";
import { flags } from "@/config/flags";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    if (!flags.grantsFeatureEnabled) {
      return NextResponse.json({ error: "Grants feature disabled" }, { status: 403 });
    }

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const grant = await prisma.accountGrant.findFirst({
      where: {
        userId: user.id,
        active: true,
        type: "FREE_LESSONS",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!grant) {
      return NextResponse.json({ error: "No active lesson grant" }, { status: 404 });
    }

    if (grant.lessonsUsed >= grant.lessonLimit) {
      return NextResponse.json(
        {
          error: "Grant lessons exhausted",
          lessonsRemaining: 0,
        },
        { status: 409 },
      );
    }

    const updated = await prisma.accountGrant.update({
      where: { id: grant.id },
      data: {
        lessonsUsed: { increment: 1 },
      },
    });

    const lessonsRemaining = Math.max(updated.lessonLimit - updated.lessonsUsed, 0);
    if (lessonsRemaining <= 0 && updated.active) {
      await prisma.accountGrant.update({
        where: { id: updated.id },
        data: { active: false },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        lessonsRemaining,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
