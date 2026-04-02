import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const createGiftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  imageUrl: z.string().trim().min(1).max(2048),
  priceCents: z.number().int().min(1).max(1_000_000),
  active: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";
    const gifts = await prisma.giftCatalog.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        priceCents: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ gifts }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = createGiftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const gift = await prisma.giftCatalog.create({
      data: {
        name: parsed.data.name,
        imageUrl: parsed.data.imageUrl,
        priceCents: parsed.data.priceCents,
        active: parsed.data.active ?? true,
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        priceCents: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ gift }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
