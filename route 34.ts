import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const updateClassSchema = z.object({
  houseId: z.string().min(1).optional(),
  level: z.number().int().positive().optional(),
  teacherId: z.string().min(1).optional(),
  dayPattern: z.string().trim().min(2).max(120).optional(),
  time: z.string().trim().min(2).max(20).optional(),
  timezone: z.string().trim().min(2).max(120).optional(),
  lessonMinutes: z.number().int().min(30).max(120).optional(),
  qnaMinutes: z.number().int().min(0).max(60).optional(),
  isActive: z.boolean().optional(),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ADMIN) return null;
  return user;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = updateClassSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { id } = await params;
    const cls = await prisma.class.update({
      where: { id },
      data: parsed.data,
      include: {
        house: { select: { id: true, name: true } },
        teacher: { select: { id: true, nickname: true, email: true } },
      },
    });

    return NextResponse.json({ class: cls }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const boundCount = await prisma.subscription.count({
      where: {
        classId: id,
        status: {
          in: ["ACTIVE", "PAST_DUE", "CANCELED"],
        },
      },
    });
    if (boundCount > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete class with bound subscriptions. Switch users first or expire subscriptions.",
        },
        { status: 409 },
      );
    }

    await prisma.class.delete({ where: { id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
