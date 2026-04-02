import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { sanitizeContentLink, sanitizeContentRichText } from "@/lib/content/sanitize";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const querySchema = z.object({
  pageKey: z.string().trim().min(1).max(120).optional(),
  includeUnpublished: z.boolean().default(false),
  limit: z.number().int().min(1).max(500).default(200),
});

const createSchema = z.object({
  pageKey: z.string().trim().min(1).max(120),
  sectionKey: z.string().trim().min(1).max(120),
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

function normalizeNullable(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function GET(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      pageKey: searchParams.get("pageKey") ?? undefined,
      includeUnpublished:
        searchParams.get("includeUnpublished") == null
          ? undefined
          : searchParams.get("includeUnpublished") === "true",
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const blocks = await prisma.pageContentBlock.findMany({
      where: {
        ...(parsed.data.pageKey ? { pageKey: parsed.data.pageKey } : {}),
        ...(parsed.data.includeUnpublished ? {} : { isPublished: true }),
      },
      orderBy: [{ pageKey: "asc" }, { sectionKey: "asc" }, { sortOrder: "asc" }],
      take: parsed.data.limit,
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
        updatedByAdmin: {
          select: { id: true, email: true, nickname: true },
        },
      },
    });

    return NextResponse.json({ blocks }, { status: 200 });
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

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const ctaHref = parsed.data.ctaHref == null ? null : sanitizeContentLink(parsed.data.ctaHref);
    const ctaSecondaryHref =
      parsed.data.ctaSecondaryHref == null ? null : sanitizeContentLink(parsed.data.ctaSecondaryHref);
    const imageUrl =
      parsed.data.imageUrl == null ? null : sanitizeContentLink(parsed.data.imageUrl);
    if (parsed.data.ctaHref && !ctaHref) {
      return NextResponse.json({ error: "Primary CTA link must be relative or http(s)." }, { status: 400 });
    }
    if (parsed.data.ctaSecondaryHref && !ctaSecondaryHref) {
      return NextResponse.json({ error: "Secondary CTA link must be relative or http(s)." }, { status: 400 });
    }
    if (parsed.data.imageUrl && !imageUrl) {
      return NextResponse.json({ error: "Image URL must be relative or http(s)." }, { status: 400 });
    }

    const block = await prisma.pageContentBlock.create({
      data: {
        pageKey: parsed.data.pageKey,
        sectionKey: parsed.data.sectionKey,
        title: normalizeNullable(parsed.data.title),
        bodyText: parsed.data.bodyText == null ? null : sanitizeContentRichText(parsed.data.bodyText),
        ctaLabel: normalizeNullable(parsed.data.ctaLabel),
        ctaHref,
        ctaSecondaryLabel: normalizeNullable(parsed.data.ctaSecondaryLabel),
        ctaSecondaryHref,
        imageUrl,
        sortOrder: parsed.data.sortOrder ?? 0,
        isPublished: parsed.data.isPublished ?? true,
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

    return NextResponse.json({ block }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
