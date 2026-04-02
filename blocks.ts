import { prisma } from "@/lib/db";

export type PublicPageContentBlock = {
  id: string;
  pageKey: string;
  sectionKey: string;
  title: string | null;
  bodyText: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  ctaSecondaryLabel: string | null;
  ctaSecondaryHref: string | null;
  imageUrl: string | null;
  sortOrder: number;
};

type GetPageBlocksOptions = {
  includeUnpublished?: boolean;
};

export async function getPublishedPageContentBlocks(
  pageKey: string,
  options?: GetPageBlocksOptions,
): Promise<PublicPageContentBlock[]> {
  return prisma.pageContentBlock.findMany({
    where: {
      pageKey,
      ...(options?.includeUnpublished ? {} : { isPublished: true }),
    },
    orderBy: [{ sectionKey: "asc" }, { sortOrder: "asc" }],
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
    },
  });
}

export function firstBlockBySection(
  blocks: PublicPageContentBlock[],
): Record<string, PublicPageContentBlock | undefined> {
  const map: Record<string, PublicPageContentBlock | undefined> = {};
  for (const block of blocks) {
    if (!map[block.sectionKey]) map[block.sectionKey] = block;
  }
  return map;
}
