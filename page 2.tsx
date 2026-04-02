import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StickersPage() {
  const [stickers, gifts] = await Promise.all([
    prisma.stickerCatalog.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, name: true, imageUrl: true, priceCents: true },
    }),
    prisma.giftCatalog.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, name: true, imageUrl: true, priceCents: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Stickers</h1>
      <p className="text-sm text-[var(--text-soft)]">
        This catalog is managed in Admin → Chat economy manager.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stickers.map((item) => (
          <article key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-4 text-center">
            <div className="mx-auto h-24 w-24 rounded-full bg-slate-200" />
            <p className="mt-3 font-semibold">{item.name}</p>
            <p className="text-[var(--brand-blue)]">${(item.priceCents / 100).toFixed(2)}</p>
            <button className="mt-3 rounded-lg bg-[var(--cta-green)] px-5 py-2 text-sm font-semibold text-white">
              Buy
            </button>
          </article>
        ))}
      </div>
      <section className="space-y-2 rounded-xl border border-[var(--line)] bg-white p-4">
        <h2 className="text-lg font-semibold">Gift catalog</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {gifts.map((gift) => (
            <div key={gift.id} className="rounded border border-[var(--line)] p-2 text-sm">
              <p className="font-semibold">{gift.name}</p>
              <p className="text-[var(--text-soft)]">${(gift.priceCents / 100).toFixed(2)}</p>
            </div>
          ))}
          {!gifts.length && <p className="text-sm text-[var(--text-soft)]">No active gifts yet.</p>}
        </div>
      </section>
    </div>
  );
}
