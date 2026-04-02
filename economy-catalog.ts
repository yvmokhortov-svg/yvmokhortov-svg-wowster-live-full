import { prisma } from "@/lib/db";

export type CatalogItem = {
  id: string;
  name: string;
  imageUrl: string;
  priceCents: number;
  active: boolean;
};

const fallbackStickers: CatalogItem[] = [
  { id: "sticker-core-1", name: "Spark", imageUrl: "/stickers/spark.png", priceCents: 299, active: true },
  { id: "sticker-core-2", name: "Heart", imageUrl: "/stickers/heart.png", priceCents: 299, active: true },
  { id: "sticker-core-3", name: "Star", imageUrl: "/stickers/star.png", priceCents: 299, active: true },
  { id: "sticker-core-4", name: "Rainbow", imageUrl: "/stickers/rainbow.png", priceCents: 299, active: true },
  { id: "sticker-core-5", name: "Flower", imageUrl: "/stickers/flower.png", priceCents: 299, active: true },
  { id: "sticker-core-6", name: "Crown", imageUrl: "/stickers/crown.png", priceCents: 299, active: true },
  { id: "sticker-core-7", name: "Smile", imageUrl: "/stickers/smile.png", priceCents: 299, active: true },
];

const fallbackGifts: CatalogItem[] = [
  { id: "gift-10", name: "Gift $10", imageUrl: "/gifts/gift-10.png", priceCents: 1000, active: true },
  { id: "gift-20", name: "Gift $20", imageUrl: "/gifts/gift-20.png", priceCents: 2000, active: true },
  { id: "gift-30", name: "Gift $30", imageUrl: "/gifts/gift-30.png", priceCents: 3000, active: true },
  { id: "gift-40", name: "Gift $40", imageUrl: "/gifts/gift-40.png", priceCents: 4000, active: true },
  { id: "gift-50", name: "Gift $50", imageUrl: "/gifts/gift-50.png", priceCents: 5000, active: true },
  { id: "gift-60", name: "Gift $60", imageUrl: "/gifts/gift-60.png", priceCents: 6000, active: true },
  { id: "gift-70", name: "Gift $70", imageUrl: "/gifts/gift-70.png", priceCents: 7000, active: true },
  { id: "gift-80", name: "Gift $80", imageUrl: "/gifts/gift-80.png", priceCents: 8000, active: true },
];

export async function loadChatCatalog() {
  const [stickers, gifts] = await Promise.all([
    prisma.stickerCatalog.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, imageUrl: true, priceCents: true, active: true },
    }),
    prisma.giftCatalog.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, imageUrl: true, priceCents: true, active: true },
    }),
  ]);

  return {
    stickers: stickers.length ? stickers : fallbackStickers,
    gifts: gifts.length ? gifts : fallbackGifts,
  };
}
