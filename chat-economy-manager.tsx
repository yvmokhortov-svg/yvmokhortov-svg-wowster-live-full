"use client";

import { FormEvent, useEffect, useState } from "react";

type CatalogItem = {
  id: string;
  name: string;
  imageUrl: string;
  priceCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type BundlePricingRow = {
  type: "STICKERS" | "GIFTS";
  bundlePriceCents: number;
  totalItems: number;
  active: boolean;
};

export function ChatEconomyManager() {
  const [stickers, setStickers] = useState<CatalogItem[]>([]);
  const [gifts, setGifts] = useState<CatalogItem[]>([]);
  const [stickerName, setStickerName] = useState("");
  const [stickerImageUrl, setStickerImageUrl] = useState("");
  const [stickerPrice, setStickerPrice] = useState(299);
  const [giftName, setGiftName] = useState("");
  const [giftImageUrl, setGiftImageUrl] = useState("");
  const [giftPrice, setGiftPrice] = useState(1000);
  const [pricing, setPricing] = useState<{
    stickers: BundlePricingRow;
    gifts: BundlePricingRow;
  }>({
    stickers: {
      type: "STICKERS",
      bundlePriceCents: 3999,
      totalItems: 6,
      active: true,
    },
    gifts: {
      type: "GIFTS",
      bundlePriceCents: 8000,
      totalItems: 8,
      active: true,
    },
  });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    setLoading(true);
    setMessage(null);
    try {
      const [stickersRes, giftsRes, pricingRes] = await Promise.all([
        fetch("/api/admin/stickers?includeInactive=true"),
        fetch("/api/admin/gifts?includeInactive=true"),
        fetch("/api/admin/bundle-pricing"),
      ]);
      const stickersData = (await stickersRes.json()) as {
        stickers?: CatalogItem[];
        error?: string;
      };
      const giftsData = (await giftsRes.json()) as { gifts?: CatalogItem[]; error?: string };
      const pricingData = (await pricingRes.json()) as {
        pricing?: { stickers: BundlePricingRow; gifts: BundlePricingRow };
        error?: string;
      };
      if (!stickersRes.ok) {
        setMessage(stickersData.error ?? "Failed to load stickers.");
        return;
      }
      if (!giftsRes.ok) {
        setMessage(giftsData.error ?? "Failed to load gifts.");
        return;
      }
      if (!pricingRes.ok) {
        setMessage(pricingData.error ?? "Failed to load bundle pricing.");
        return;
      }
      setStickers(stickersData.stickers ?? []);
      setGifts(giftsData.gifts ?? []);
      if (pricingData.pricing) {
        setPricing(pricingData.pricing);
      }
    } catch {
      setMessage("Failed to load chat economy manager.");
    } finally {
      setLoading(false);
    }
  }

  async function createSticker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const res = await fetch("/api/admin/stickers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: stickerName,
        imageUrl: stickerImageUrl,
        priceCents: stickerPrice,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to create sticker.");
      return;
    }
    setStickerName("");
    setStickerImageUrl("");
    setStickerPrice(299);
    setMessage("Sticker created.");
    await loadAll();
  }

  async function createGift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const res = await fetch("/api/admin/gifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: giftName,
        imageUrl: giftImageUrl,
        priceCents: giftPrice,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to create gift.");
      return;
    }
    setGiftName("");
    setGiftImageUrl("");
    setGiftPrice(1000);
    setMessage("Gift created.");
    await loadAll();
  }

  async function patchSticker(id: string, payload: Partial<CatalogItem>) {
    const res = await fetch(`/api/admin/stickers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to update sticker.");
      return;
    }
    await loadAll();
  }

  async function patchGift(id: string, payload: Partial<CatalogItem>) {
    const res = await fetch(`/api/admin/gifts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to update gift.");
      return;
    }
    await loadAll();
  }

  async function removeSticker(id: string) {
    if (!window.confirm("Delete this sticker?")) return;
    const res = await fetch(`/api/admin/stickers/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to delete sticker.");
      return;
    }
    await loadAll();
  }

  async function removeGift(id: string) {
    if (!window.confirm("Delete this gift?")) return;
    const res = await fetch(`/api/admin/gifts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to delete gift.");
      return;
    }
    await loadAll();
  }

  async function saveBundlePricing(type: "STICKERS" | "GIFTS") {
    const source = type === "STICKERS" ? pricing.stickers : pricing.gifts;
    const res = await fetch("/api/admin/bundle-pricing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        bundlePriceCents: source.bundlePriceCents,
        totalItems: source.totalItems,
        active: source.active,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to save bundle pricing.");
      return;
    }
    setMessage(type === "STICKERS" ? "Sticker bundle pricing saved." : "Gift bundle pricing saved.");
    await loadAll();
  }

  useEffect(() => {
    void loadAll();
  }, []);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <h2 className="text-xl font-semibold">Chat economy manager</h2>
      <p className="mt-1 text-sm text-[var(--text-soft)]">
        Manage stickers, gifts, and bundle pricing used in live chat purchases.
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => void loadAll()}
          className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
        >
          Refresh economy catalog
        </button>
      </div>
      {loading && <p className="mt-2 text-sm text-[var(--text-soft)]">Loading…</p>}
      {message && <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <form onSubmit={createSticker} className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Add sticker</p>
          <input
            value={stickerName}
            onChange={(event) => setStickerName(event.target.value)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Sticker name"
            required
          />
          <input
            value={stickerImageUrl}
            onChange={(event) => setStickerImageUrl(event.target.value)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Image URL"
            required
          />
          <input
            type="number"
            min={1}
            value={stickerPrice}
            onChange={(event) => setStickerPrice(Number(event.target.value))}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Price cents"
            required
          />
          <button className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white">
            Create sticker
          </button>
        </form>

        <form onSubmit={createGift} className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Add gift</p>
          <input
            value={giftName}
            onChange={(event) => setGiftName(event.target.value)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Gift name"
            required
          />
          <input
            value={giftImageUrl}
            onChange={(event) => setGiftImageUrl(event.target.value)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Image URL"
            required
          />
          <input
            type="number"
            min={1}
            value={giftPrice}
            onChange={(event) => setGiftPrice(Number(event.target.value))}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Price cents"
            required
          />
          <button className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white">
            Create gift
          </button>
        </form>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Stickers</p>
          {stickers.map((item) => (
            <div key={item.id} className="rounded border border-[var(--line)] p-2 text-sm">
              <p className="font-semibold">{item.name}</p>
              <p className="text-[var(--text-soft)]">
                ${(item.priceCents / 100).toFixed(2)} • {item.active ? "active" : "inactive"}
              </p>
              <p className="truncate text-[var(--text-soft)]">{item.imageUrl}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void patchSticker(item.id, { active: !item.active })}
                  className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-white"
                >
                  {item.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextPrice = Number(window.prompt("New price cents", String(item.priceCents)));
                    if (Number.isFinite(nextPrice) && nextPrice > 0) {
                      void patchSticker(item.id, { priceCents: nextPrice });
                    }
                  }}
                  className="rounded bg-indigo-700 px-2 py-1 text-xs font-semibold text-white"
                >
                  Edit price
                </button>
                <button
                  type="button"
                  onClick={() => void removeSticker(item.id)}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!stickers.length && <p className="text-sm text-[var(--text-soft)]">No stickers yet.</p>}
        </div>

        <div className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Gifts</p>
          {gifts.map((item) => (
            <div key={item.id} className="rounded border border-[var(--line)] p-2 text-sm">
              <p className="font-semibold">{item.name}</p>
              <p className="text-[var(--text-soft)]">
                ${(item.priceCents / 100).toFixed(2)} • {item.active ? "active" : "inactive"}
              </p>
              <p className="truncate text-[var(--text-soft)]">{item.imageUrl}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void patchGift(item.id, { active: !item.active })}
                  className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-white"
                >
                  {item.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextPrice = Number(window.prompt("New price cents", String(item.priceCents)));
                    if (Number.isFinite(nextPrice) && nextPrice > 0) {
                      void patchGift(item.id, { priceCents: nextPrice });
                    }
                  }}
                  className="rounded bg-indigo-700 px-2 py-1 text-xs font-semibold text-white"
                >
                  Edit price
                </button>
                <button
                  type="button"
                  onClick={() => void removeGift(item.id)}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!gifts.length && <p className="text-sm text-[var(--text-soft)]">No gifts yet.</p>}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Sticker bundle pricing</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              value={pricing.stickers.bundlePriceCents}
              onChange={(event) =>
                setPricing((prev) => ({
                  ...prev,
                  stickers: {
                    ...prev.stickers,
                    bundlePriceCents: Number(event.target.value),
                  },
                }))
              }
              className="rounded border border-[var(--line)] p-2 text-sm"
              placeholder="Bundle price cents"
            />
            <input
              type="number"
              min={1}
              value={pricing.stickers.totalItems}
              onChange={(event) =>
                setPricing((prev) => ({
                  ...prev,
                  stickers: {
                    ...prev.stickers,
                    totalItems: Number(event.target.value),
                  },
                }))
              }
              className="rounded border border-[var(--line)] p-2 text-sm"
              placeholder="Items in bundle"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pricing.stickers.active}
              onChange={(event) =>
                setPricing((prev) => ({
                  ...prev,
                  stickers: {
                    ...prev.stickers,
                    active: event.target.checked,
                  },
                }))
              }
            />
            Bundle active
          </label>
          <button
            type="button"
            onClick={() => void saveBundlePricing("STICKERS")}
            className="rounded bg-zinc-800 px-3 py-2 text-sm font-semibold text-white"
          >
            Save sticker bundle pricing
          </button>
        </div>

        <div className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Gift bundle pricing</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              value={pricing.gifts.bundlePriceCents}
              onChange={(event) =>
                setPricing((prev) => ({
                  ...prev,
                  gifts: {
                    ...prev.gifts,
                    bundlePriceCents: Number(event.target.value),
                  },
                }))
              }
              className="rounded border border-[var(--line)] p-2 text-sm"
              placeholder="Bundle price cents"
            />
            <input
              type="number"
              min={1}
              value={pricing.gifts.totalItems}
              onChange={(event) =>
                setPricing((prev) => ({
                  ...prev,
                  gifts: {
                    ...prev.gifts,
                    totalItems: Number(event.target.value),
                  },
                }))
              }
              className="rounded border border-[var(--line)] p-2 text-sm"
              placeholder="Items in bundle"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pricing.gifts.active}
              onChange={(event) =>
                setPricing((prev) => ({
                  ...prev,
                  gifts: {
                    ...prev.gifts,
                    active: event.target.checked,
                  },
                }))
              }
            />
            Bundle active
          </label>
          <button
            type="button"
            onClick={() => void saveBundlePricing("GIFTS")}
            className="rounded bg-zinc-800 px-3 py-2 text-sm font-semibold text-white"
          >
            Save gift bundle pricing
          </button>
        </div>
      </div>
    </section>
  );
}
