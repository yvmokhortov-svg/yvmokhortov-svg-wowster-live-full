import { type BundleType } from "@/generated/prisma/enums";
import { getBundlePricingMap } from "@/lib/chat/bundle-pricing";
import { loadChatCatalog } from "@/lib/chat/economy-catalog";
import { SUBSCRIPTION_TIERS } from "@/lib/subscriptions/tiers";

export function subscriptionAmountFromTier(tierCents: number): number | null {
  return SUBSCRIPTION_TIERS.some((tier) => tier.cents === tierCents) ? tierCents : null;
}

export async function stickerAmountById(itemId: string): Promise<number | null> {
  const { stickers } = await loadChatCatalog();
  const item = stickers.find((row) => row.id === itemId);
  return item?.priceCents ?? null;
}

export async function giftAmountById(itemId: string): Promise<number | null> {
  const { gifts } = await loadChatCatalog();
  const item = gifts.find((row) => row.id === itemId);
  return item?.priceCents ?? null;
}

export async function bundleAmountByType(
  bundleType: "stickers" | "gifts",
): Promise<{ amountCents: number; totalItems: number; active: boolean; type: BundleType }> {
  const map = await getBundlePricingMap();
  const row = bundleType === "stickers" ? map.STICKERS : map.GIFTS;
  return {
    amountCents: row.bundlePriceCents,
    totalItems: row.totalItems,
    active: row.active,
    type: row.type,
  };
}
