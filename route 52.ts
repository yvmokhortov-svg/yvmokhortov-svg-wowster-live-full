import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { flags } from "@/config/flags";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

const patchGrantSchema = z.object({
  active: z.boolean().optional(),
  lessonLimit: z.number().int().min(1).max(8).optional(),
  resetLessonsUsed: z.boolean().optional(),
  reason: z.string().max(300).nullable().optional(),
});

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!flags.grantsFeatureEnabled) {
      return NextResponse.json({ error: "Grants feature disabled" }, { status: 403 });
    }

    const { id } = await params;
    const json = await request.json();
    const parsed = patchGrantSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const grant = await prisma.accountGrant.update({
      where: { id },
      data: {
        active: parsed.data.active,
        lessonLimit: parsed.data.lessonLimit,
        lessonsUsed: parsed.data.resetLessonsUsed ? 0 : undefined,
        reason: parsed.data.reason,
      },
    });

    return NextResponse.json({ grant }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
