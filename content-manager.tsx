"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ContentBlock = {
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
  isPublished: boolean;
  updatedAt: string;
};

const PAGE_KEYS = ["home", "program", "support", "subscriptions", "teacher", "profile"] as const;

export function ContentManager() {
  const [pageKey, setPageKey] = useState<(typeof PAGE_KEYS)[number]>("home");
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(false);

  const [sectionKey, setSectionKey] = useState("hero");
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [ctaSecondaryLabel, setCtaSecondaryLabel] = useState("");
  const [ctaSecondaryHref, setCtaSecondaryHref] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isPublished, setIsPublished] = useState(true);

  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => a.sectionKey.localeCompare(b.sectionKey) || a.sortOrder - b.sortOrder),
    [blocks],
  );

  async function loadBlocks() {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        pageKey,
        includeUnpublished: "true",
        limit: "400",
      });
      const res = await fetch(`/api/admin/content?${params.toString()}`);
      const data = (await res.json()) as { blocks?: ContentBlock[]; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Failed to load content blocks.");
        return;
      }
      setBlocks(data.blocks ?? []);
    } catch {
      setMessage("Failed to load content blocks.");
    } finally {
      setLoading(false);
    }
  }

  async function createBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const res = await fetch("/api/admin/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageKey,
        sectionKey,
        title: title || null,
        bodyText: bodyText || null,
        ctaLabel: ctaLabel || null,
        ctaHref: ctaHref || null,
        ctaSecondaryLabel: ctaSecondaryLabel || null,
        ctaSecondaryHref: ctaSecondaryHref || null,
        sortOrder,
        isPublished,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to create content block.");
      return;
    }
    setMessage("Content block created.");
    await loadBlocks();
  }

  async function patchBlock(id: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/admin/content/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to update block.");
      return;
    }
    setMessage("Content block updated.");
    await loadBlocks();
  }

  async function moveBlock(block: ContentBlock, delta: number) {
    await patchBlock(block.id, { sortOrder: block.sortOrder + delta });
  }

  async function editBlock(block: ContentBlock) {
    const nextTitle = window.prompt("Title", block.title ?? "");
    if (nextTitle === null) return;
    const nextBodyText = window.prompt("Body text", block.bodyText ?? "");
    if (nextBodyText === null) return;
    const nextCtaLabel = window.prompt("Primary CTA label", block.ctaLabel ?? "");
    if (nextCtaLabel === null) return;
    const nextCtaHref = window.prompt("Primary CTA href", block.ctaHref ?? "");
    if (nextCtaHref === null) return;
    const nextSecondaryLabel = window.prompt(
      "Secondary CTA label",
      block.ctaSecondaryLabel ?? "",
    );
    if (nextSecondaryLabel === null) return;
    const nextSecondaryHref = window.prompt(
      "Secondary CTA href",
      block.ctaSecondaryHref ?? "",
    );
    if (nextSecondaryHref === null) return;

    await patchBlock(block.id, {
      title: nextTitle || null,
      bodyText: nextBodyText || null,
      ctaLabel: nextCtaLabel || null,
      ctaHref: nextCtaHref || null,
      ctaSecondaryLabel: nextSecondaryLabel || null,
      ctaSecondaryHref: nextSecondaryHref || null,
    });
  }

  async function removeBlock(id: string) {
    if (!window.confirm("Delete this content block?")) return;
    const res = await fetch(`/api/admin/content/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to delete block.");
      return;
    }
    setMessage("Content block deleted.");
    await loadBlocks();
  }

  async function togglePreview(nextEnabled: boolean) {
    const res = await fetch("/api/admin/content/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled }),
    });
    const data = (await res.json()) as { previewEnabled?: boolean; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to update preview mode.");
      return;
    }
    setPreviewEnabled(data.previewEnabled === true);
    setMessage(data.previewEnabled ? "Preview mode enabled." : "Preview mode disabled.");
  }

  useEffect(() => {
    void loadBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  useEffect(() => {
    let active = true;
    async function loadPreviewState() {
      try {
        const res = await fetch("/api/admin/content/preview");
        const data = (await res.json()) as { previewEnabled?: boolean };
        if (!res.ok || !active) return;
        setPreviewEnabled(data.previewEnabled === true);
      } catch {
        // no-op
      }
    }
    void loadPreviewState();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!previewEnabled) return;
    void loadBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewEnabled]);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Content manager</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Edit page copy and CTAs from admin without code changes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void togglePreview(!previewEnabled)}
            className="rounded bg-zinc-700 px-3 py-2 text-sm font-semibold text-white"
          >
            {previewEnabled ? "Disable preview" : "Enable preview"}
          </button>
          <select
            value={pageKey}
            onChange={(event) => setPageKey(event.target.value as (typeof PAGE_KEYS)[number])}
            className="rounded border border-[var(--line)] p-2 text-sm"
          >
            {PAGE_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadBlocks()}
            className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="mt-2 text-sm text-[var(--text-soft)]">Loading...</p>}
      {message && <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>}

      <form onSubmit={createBlock} className="mt-4 grid gap-2 rounded border border-[var(--line)] p-3 md:grid-cols-2">
        <input
          value={sectionKey}
          onChange={(event) => setSectionKey(event.target.value)}
          placeholder="section key (e.g. hero)"
          className="rounded border border-[var(--line)] p-2 text-sm"
          required
        />
        <input
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value))}
          placeholder="sort order"
          className="rounded border border-[var(--line)] p-2 text-sm"
        />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="title"
          className="rounded border border-[var(--line)] p-2 text-sm md:col-span-2"
        />
        <textarea
          value={bodyText}
          onChange={(event) => setBodyText(event.target.value)}
          placeholder="body text"
          rows={3}
          className="rounded border border-[var(--line)] p-2 text-sm md:col-span-2"
        />
        <input
          value={ctaLabel}
          onChange={(event) => setCtaLabel(event.target.value)}
          placeholder="primary CTA label"
          className="rounded border border-[var(--line)] p-2 text-sm"
        />
        <input
          value={ctaHref}
          onChange={(event) => setCtaHref(event.target.value)}
          placeholder="primary CTA href"
          className="rounded border border-[var(--line)] p-2 text-sm"
        />
        <input
          value={ctaSecondaryLabel}
          onChange={(event) => setCtaSecondaryLabel(event.target.value)}
          placeholder="secondary CTA label"
          className="rounded border border-[var(--line)] p-2 text-sm"
        />
        <input
          value={ctaSecondaryHref}
          onChange={(event) => setCtaSecondaryHref(event.target.value)}
          placeholder="secondary CTA href"
          className="rounded border border-[var(--line)] p-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(event) => setIsPublished(event.target.checked)}
          />
          Published
        </label>
        <button className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white md:col-span-2">
          Add block
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {!sortedBlocks.length && <p className="text-sm text-[var(--text-soft)]">No blocks yet for this page.</p>}
        {sortedBlocks.map((block) => (
          <article key={block.id} className="rounded border border-[var(--line)] p-3 text-sm">
            <p className="font-semibold">
              {block.sectionKey} • order {block.sortOrder} • {block.isPublished ? "published" : "draft"}
            </p>
            <p className="text-[var(--text-soft)]">{block.title ?? "(no title)"}</p>
            {block.bodyText && <p className="mt-1 text-[var(--text-soft)]">{block.bodyText}</p>}
            <p className="mt-1 text-[var(--text-soft)]">
              CTA: {block.ctaLabel ?? "-"} → {block.ctaHref ?? "-"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void patchBlock(block.id, { isPublished: !block.isPublished })}
                className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-white"
              >
                {block.isPublished ? "Unpublish" : "Publish"}
              </button>
              <button
                type="button"
                onClick={() => void moveBlock(block, -1)}
                className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-white"
              >
                Move up
              </button>
              <button
                type="button"
                onClick={() => void moveBlock(block, 1)}
                className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-white"
              >
                Move down
              </button>
              <button
                type="button"
                onClick={() => void editBlock(block)}
                className="rounded bg-indigo-700 px-2 py-1 text-xs font-semibold text-white"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void removeBlock(block.id)}
                className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
