import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const createHouseSchema = z.object({
  name: z.string().trim().min(3).max(120),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ADMIN) return null;
  return user;
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const houses = await prisma.house.findMany({
      include: {
        classes: {
          select: { id: true, level: true, dayPattern: true, time: true, isActive: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ houses }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = createHouseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const house = await prisma.house.create({
      data: {
        name: parsed.data.name,
      },
    });

    return NextResponse.json({ house }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
