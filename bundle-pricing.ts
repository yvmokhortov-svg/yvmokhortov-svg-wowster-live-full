import { BundleType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

export type BundlePricingOffer = {
  type: BundleType;
  bundlePriceCents: number;
  totalItems: number;
  active: boolean;
};

const DEFAULT_BUNDLE_PRICING: Record<BundleType, Omit<BundlePricingOffer, "type">> = {
  STICKERS: {
    bundlePriceCents: 3999,
    totalItems: 6,
    active: true,
  },
  GIFTS: {
    bundlePriceCents: 8000,
    totalItems: 8,
    active: true,
  },
};

export async function ensureBundlePricingDefaults(): Promise<void> {
  const existing = await prisma.chatBundlePricing.findMany({
    select: { type: true },
  });
  const existingSet = new Set(existing.map((row) => row.type));
  const missingTypes = (Object.keys(DEFAULT_BUNDLE_PRICING) as BundleType[]).filter(
    (type) => !existingSet.has(type),
  );
  if (!missingTypes.length) return;

  await prisma.chatBundlePricing.createMany({
    data: missingTypes.map((type) => ({
      type,
      bundlePriceCents: DEFAULT_BUNDLE_PRICING[type].bundlePriceCents,
      totalItems: DEFAULT_BUNDLE_PRICING[type].totalItems,
      active: DEFAULT_BUNDLE_PRICING[type].active,
    })),
  });
}

export async function getBundlePricingMap(): Promise<Record<BundleType, BundlePricingOffer>> {
  await ensureBundlePricingDefaults();
  const rows = await prisma.chatBundlePricing.findMany({
    select: {
      type: true,
      bundlePriceCents: true,
      totalItems: true,
      active: true,
    },
  });

  const map: Partial<Record<BundleType, BundlePricingOffer>> = {};
  for (const type of Object.keys(DEFAULT_BUNDLE_PRICING) as BundleType[]) {
    const dbRow = rows.find((row) => row.type === type);
    if (dbRow) {
      map[type] = {
        type,
        bundlePriceCents: dbRow.bundlePriceCents,
        totalItems: dbRow.totalItems,
        active: dbRow.active,
      };
    } else {
      map[type] = {
        type,
        ...DEFAULT_BUNDLE_PRICING[type],
      };
    }
  }

  return map as Record<BundleType, BundlePricingOffer>;
}
