import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { sanitizeContentLink, sanitizeContentRichText } from "@/lib/content/sanitize";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const patchSchema = z.object({
  pageKey: z.string().trim().min(1).max(120).optional(),
  sectionKey: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().max(300).nullable().optional(),
  bodyText: z.string().trim().max(10000).nullable().optional(),
  ctaLabel: z.string().trim().max(200).nullable().optional(),
  ctaHref: z.string().trim().max(2000).nullable().optional(),
  ctaSecondaryLabel: z.string().trim().max(200).nullable().optional(),
  ctaSecondaryHref: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(-10000).max(10000).optional(),
  isPublished: z.boolean().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const existing = await prisma.pageContentBlock.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Block not found" }, { status: 404 });

    const nextCtaHref =
      parsed.data.ctaHref === undefined
        ? undefined
        : parsed.data.ctaHref === null
          ? null
          : sanitizeContentLink(parsed.data.ctaHref);
    const nextSecondaryHref =
      parsed.data.ctaSecondaryHref === undefined
        ? undefined
        : parsed.data.ctaSecondaryHref === null
          ? null
          : sanitizeContentLink(parsed.data.ctaSecondaryHref);
    const nextImageUrl =
      parsed.data.imageUrl === undefined
        ? undefined
        : parsed.data.imageUrl === null
          ? null
          : sanitizeContentLink(parsed.data.imageUrl);

    if (parsed.data.ctaHref !== undefined && parsed.data.ctaHref !== null && !nextCtaHref) {
      return NextResponse.json(
        { error: "Invalid primary CTA URL. Use /relative-path or https:// URL." },
        { status: 400 },
      );
    }
    if (
      parsed.data.ctaSecondaryHref !== undefined &&
      parsed.data.ctaSecondaryHref !== null &&
      !nextSecondaryHref
    ) {
      return NextResponse.json(
        { error: "Invalid secondary CTA URL. Use /relative-path or https:// URL." },
        { status: 400 },
      );
    }
    if (parsed.data.imageUrl !== undefined && parsed.data.imageUrl !== null && !nextImageUrl) {
      return NextResponse.json(
        { error: "Invalid image URL. Use /relative-path or https:// URL." },
        { status: 400 },
      );
    }

    const block = await prisma.pageContentBlock.update({
      where: { id },
      data: {
        ...(parsed.data.pageKey !== undefined ? { pageKey: parsed.data.pageKey } : {}),
        ...(parsed.data.sectionKey !== undefined ? { sectionKey: parsed.data.sectionKey } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        ...(parsed.data.isPublished !== undefined ? { isPublished: parsed.data.isPublished } : {}),
        ...(parsed.data.title !== undefined
          ? { title: parsed.data.title === null ? null : sanitizeContentRichText(parsed.data.title) }
          : {}),
        ...(parsed.data.bodyText !== undefined
          ? {
              bodyText:
                parsed.data.bodyText === null
                  ? null
                  : sanitizeContentRichText(parsed.data.bodyText),
            }
          : {}),
        ...(parsed.data.ctaLabel !== undefined
          ? {
              ctaLabel:
                parsed.data.ctaLabel === null
                  ? null
                  : sanitizeContentRichText(parsed.data.ctaLabel),
            }
          : {}),
        ...(parsed.data.ctaSecondaryLabel !== undefined
          ? {
              ctaSecondaryLabel:
                parsed.data.ctaSecondaryLabel === null
                  ? null
                  : sanitizeContentRichText(parsed.data.ctaSecondaryLabel),
            }
          : {}),
        ...(nextCtaHref !== undefined ? { ctaHref: nextCtaHref } : {}),
        ...(nextSecondaryHref !== undefined ? { ctaSecondaryHref: nextSecondaryHref } : {}),
        ...(nextImageUrl !== undefined ? { imageUrl: nextImageUrl } : {}),
        updatedByAdminId: actor.id,
      },
      select: {
        id: true,
        pageKey: true,
        sectionKey: true,
        title: true,
        bodyText: true,
        ctaLabel: true,
        ctaHref: true,
        ctaSecondaryLabel: true,
        ctaSecondaryHref: true,
        imageUrl: true,
        sortOrder: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ block }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await context.params;
    const existing = await prisma.pageContentBlock.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Block not found" }, { status: 404 });

    await prisma.pageContentBlock.delete({
      where: { id },
      select: { id: true },
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
