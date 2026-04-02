import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { flags } from "@/config/flags";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

const createGrantSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z.email().toLowerCase().optional(),
    lessonCount: z.number().int().min(1).max(8).default(4),
    reason: z.string().max(300).optional(),
  })
  .refine((data) => data.userId || data.email, {
    message: "Provide userId or email",
    path: ["userId"],
  });

export const runtime = "nodejs";

async function requireAdmin() {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== Role.ADMIN) return null;
  return actor;
}

export async function GET(request: Request) {
  try {
    const actor = await requireAdmin();
    if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!flags.grantsFeatureEnabled) {
      return NextResponse.json({ error: "Grants feature disabled" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const email = searchParams.get("email");

    const grants = await prisma.accountGrant.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(email
          ? {
              user: {
                email: email.toLowerCase(),
              },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, email: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(
      {
        grants: grants.map((g) => ({
          ...g,
          lessonsRemaining: Math.max(g.lessonLimit - g.lessonsUsed, 0),
        })),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!flags.grantsFeatureEnabled) {
      return NextResponse.json({ error: "Grants feature disabled" }, { status: 403 });
    }

    const json = await request.json();
    const parsed = createGrantSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    let userId = parsed.data.userId ?? null;
    if (!userId && parsed.data.email) {
      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "No account found for email" },
          { status: 404 },
        );
      }
      userId = user.id;
    }

    if (!userId) {
      return NextResponse.json({ error: "Missing target user" }, { status: 400 });
    }

    const grant = await prisma.accountGrant.create({
      data: {
        userId,
        type: "FREE_LESSONS",
        lessonLimit: parsed.data.lessonCount,
        lessonsUsed: 0,
        active: true,
        reason: parsed.data.reason ?? null,
        createdByAdminId: actor.id,
      },
    });

    return NextResponse.json({ grant }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
