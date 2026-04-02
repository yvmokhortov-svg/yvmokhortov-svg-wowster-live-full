import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { resolveClassIdFromSelection } from "@/lib/classes/resolve-class";

export const runtime = "nodejs";

const switchClassSchema = z.object({
  subscriptionId: z.string().optional(),
  classId: z.string().optional(),
  houseName: z.string().optional(),
  level: z.number().int().positive().optional(),
  classDay: z.string().optional(),
  classTime: z.string().optional(),
  teacherNickname: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const json = await request.json();
    const parsed = switchClassSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const targetClassId = await resolveClassIdFromSelection({
      classId: parsed.data.classId ?? null,
      houseName: parsed.data.houseName ?? null,
      level: parsed.data.level ?? null,
      classDay: parsed.data.classDay ?? null,
      classTime: parsed.data.classTime ?? null,
      teacherNickname: parsed.data.teacherNickname ?? null,
    });
    if (!targetClassId) {
      return NextResponse.json(
        { error: "Class not found for selection" },
        { status: 404 },
      );
    }

    const subscription = parsed.data.subscriptionId
      ? await prisma.subscription.findFirst({
          where: {
            id: parsed.data.subscriptionId,
            userId: user.id,
            status: "ACTIVE",
          },
        })
      : await prisma.subscription.findFirst({
          where: {
            userId: user.id,
            status: "ACTIVE",
          },
          orderBy: { createdAt: "asc" },
        });

    if (!subscription) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }

    if (subscription.switchUsedThisCycle) {
      return NextResponse.json(
        { error: "Class switch already used this billing cycle" },
        { status: 409 },
      );
    }

    if (subscription.classId === targetClassId) {
      return NextResponse.json(
        { error: "Subscription already bound to this class" },
        { status: 409 },
      );
    }

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        classId: targetClassId,
        switchUsedThisCycle: true,
      },
      select: {
        id: true,
        classId: true,
        switchUsedThisCycle: true,
        renewalDate: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        subscription: updated,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
