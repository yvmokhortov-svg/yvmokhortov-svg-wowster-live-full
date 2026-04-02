import { NextResponse } from "next/server";
import { z } from "zod";
import { BundleType, Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { getBundlePricingMap } from "@/lib/chat/bundle-pricing";

export const runtime = "nodejs";

const patchPricingSchema = z.object({
  type: z.enum(["STICKERS", "GIFTS"]),
  bundlePriceCents: z.number().int().min(1).max(2_000_000),
  totalItems: z.number().int().min(1).max(1000),
  active: z.boolean().optional(),
});

export async function GET() {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const map = await getBundlePricingMap();
    return NextResponse.json(
      {
        pricing: {
          stickers: map.STICKERS,
          gifts: map.GIFTS,
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = patchPricingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const row = await prisma.chatBundlePricing.upsert({
      where: { type: parsed.data.type as BundleType },
      create: {
        type: parsed.data.type as BundleType,
        bundlePriceCents: parsed.data.bundlePriceCents,
        totalItems: parsed.data.totalItems,
        active: parsed.data.active ?? true,
      },
      update: {
        bundlePriceCents: parsed.data.bundlePriceCents,
        totalItems: parsed.data.totalItems,
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
      select: {
        id: true,
        type: true,
        bundlePriceCents: true,
        totalItems: true,
        active: true,
      },
    });

    return NextResponse.json({ pricing: row }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
