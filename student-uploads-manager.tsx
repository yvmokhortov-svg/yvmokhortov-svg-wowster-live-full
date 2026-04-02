"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type UploadRow = {
  id: string;
  slotIndex: number;
  imageUrl: string;
  feedbackText: string | null;
  tasksText: string | null;
  updatedAt: string;
};

type SubscriptionRow = {
  id: string;
  status: string;
  tierPriceCents: number;
  class: {
    dayPattern: string;
    time: string;
    teacher: { id: string; nickname: string; email: string };
    level: number;
    house: { name: string };
  } | null;
  slots: UploadRow[];
  slot9:
    | {
        id: string;
        approvedBool: boolean;
        decidedAt: string;
        teacher: { id: string; nickname: string } | null;
        imageUrl: string;
        remark: string | null;
        sourceUploadId: string;
      }
    | null;
};

type LikeEntry = {
  id: string;
  liker: {
    id: string;
    nickname: string;
    role: string;
    isTeacher: boolean;
  };
};

type Props = {
  currentUserId: string;
};

export function StudentUploadsManager({ currentUserId }: Props) {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({});
  const [likesByTargetId, setLikesByTargetId] = useState<Record<string, LikeEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const uploadIds = useMemo(
    () => subscriptions.flatMap((sub) => sub.slots.map((slot) => slot.id)),
    [subscriptions],
  );

  const loadLikes = useCallback(async () => {
    if (!uploadIds.length) {
      setLikesByTargetId({});
      return;
    }
    const params = new URLSearchParams({
      targetType: "GRADUATION_WORK",
      targetIds: uploadIds.join(","),
    });
    const res = await fetch(`/api/likes?${params.toString()}`);
    const data = (await res.json()) as {
      byTargetId?: Record<string, LikeEntry[]>;
    };
    if (res.ok) {
      setLikesByTargetId(data.byTargetId ?? {});
    }
  }, [uploadIds]);

  const loadUploads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/uploads");
      const data = (await res.json()) as {
        subscriptions?: SubscriptionRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to load uploads.");
        return;
      }
      setSubscriptions(data.subscriptions ?? []);
      const nextDrafts: Record<string, string> = {};
      for (const sub of data.subscriptions ?? []) {
        for (let slot = 1; slot <= 8; slot += 1) {
          const row = sub.slots.find((item) => item.slotIndex === slot);
          nextDrafts[`${sub.id}:${slot}`] = row?.imageUrl ?? "";
        }
      }
      setDraftUrls(nextDrafts);
    } catch {
      setError("Failed to load uploads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  useEffect(() => {
    void loadLikes();
  }, [loadLikes]);

  async function saveSlot(subscriptionId: string, slotIndex: number) {
    const key = `${subscriptionId}:${slotIndex}`;
    const imageUrl = (draftUrls[key] ?? "").trim();
    if (!imageUrl) {
      setError("Please enter image URL before saving slot.");
      return;
    }
    setSavingKey(key);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, slotIndex, imageUrl }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save slot.");
        return;
      }
      setMessage(`Saved slot ${slotIndex}.`);
      await loadUploads();
      await loadLikes();
    } catch {
      setError("Failed to save slot.");
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleLike(uploadId: string) {
    const likes = likesByTargetId[uploadId] ?? [];
    const alreadyLiked = likes.some((entry) => entry.liker.id === currentUserId);
    const res = await fetch("/api/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "GRADUATION_WORK",
        targetId: uploadId,
        action: alreadyLiked ? "unlike" : "like",
      }),
    });
    if (res.ok) {
      await loadLikes();
    }
  }

  function nextHouseName(currentHouse: string | null | undefined): string | null {
    const order = ["Picassos", "DaVincis", "Michelangelos", "Monets"];
    const idx = currentHouse ? order.indexOf(currentHouse) : -1;
    if (idx < 0 || idx >= order.length - 1) return null;
    return order[idx + 1] ?? null;
  }

  function houseDisplayName(house: string | null | undefined): string {
    if (!house) return "";
    if (house === "DaVincis") return "Da Vincis";
    return house;
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">My Upload Slots (8 + optional slot 9 badge)</h2>
        <button
          type="button"
          className="rounded border border-[var(--line)] px-3 py-1 text-xs font-semibold"
          onClick={() => void loadUploads()}
        >
          Refresh
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--text-soft)]">
        All subscriptions have 8 upload slots. Teachers can write feedback/tasks under each
        slot. When teacher approves slot 8, slot 9 appears with the duplicated image +
        teacher remark.
      </p>

      {error ? (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-[var(--text-soft)]">Loading slots…</p>
      ) : subscriptions.length ? (
        <div className="mt-4 space-y-4">
          {subscriptions.map((sub) => (
            <article key={sub.id} className="rounded-lg border border-[var(--line)] p-3">
              <p className="text-sm font-semibold">
                Tier ${(sub.tierPriceCents / 100).toFixed(0)} • {sub.class?.house?.name ?? "-"} /{" "}
                Level {sub.class?.level ?? "-"} • {sub.class?.teacher?.nickname ?? "-"}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, idx) => {
                  const slot = idx + 1;
                  const key = `${sub.id}:${slot}`;
                  const upload = sub.slots.find((item) => item.slotIndex === slot) ?? null;
                  const likes = upload ? likesByTargetId[upload.id] ?? [] : [];
                  const alreadyLiked = likes.some((entry) => entry.liker.id === currentUserId);

                  return (
                    <div key={slot} className="rounded border border-[var(--line)] p-2">
                      <p className="text-xs font-semibold">Slot {slot}</p>
                      <input
                        value={draftUrls[key] ?? ""}
                        onChange={(event) =>
                          setDraftUrls((prev) => ({ ...prev, [key]: event.target.value }))
                        }
                        placeholder="Image URL"
                        className="mt-2 w-full rounded border border-[var(--line)] px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        disabled={savingKey === key}
                        onClick={() => void saveSlot(sub.id, slot)}
                        className="mt-2 rounded bg-zinc-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {savingKey === key ? "Saving…" : "Save slot"}
                      </button>

                      {upload ? (
                        <div className="mt-2 space-y-1 text-xs text-[var(--text-soft)]">
                          <a href={upload.imageUrl} target="_blank" rel="noreferrer" className="underline">
                            Open uploaded work
                          </a>
                          {upload.feedbackText ? (
                            <p>
                              <span className="font-semibold text-zinc-700">Teacher note:</span>{" "}
                              {upload.feedbackText}
                            </p>
                          ) : null}
                          {upload.tasksText ? (
                            <p>
                              <span className="font-semibold text-zinc-700">Teacher task:</span>{" "}
                              {upload.tasksText}
                            </p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void toggleLike(upload.id)}
                            className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                          >
                            {alreadyLiked ? "Unlike" : "Like"} ({likes.length})
                          </button>
                          {likes.length ? (
                            <ul className="space-y-1">
                              {likes.slice(0, 5).map((like) => (
                                <li key={like.id}>
                                  {like.liker.nickname}
                                  {like.liker.isTeacher ? " • Teacher" : ""}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 rounded border border-sky-300 bg-sky-50 p-2 text-sm">
                <p className="font-semibold">Slot 9 • Graduation tile</p>
                {sub.slot9 ? (
                  <div className="mt-1 space-y-1">
                    <p className="font-semibold text-emerald-700">
                      You&apos;ve been promoted to the next house
                      {nextHouseName(sub.class?.house?.name)
                        ? `: House of ${houseDisplayName(
                            nextHouseName(sub.class?.house?.name),
                          )}`
                        : "."}
                    </p>
                    <div className="rounded border border-sky-200 bg-white/80 p-2 text-xs">
                      <p className="font-semibold">Please choose:</p>
                      <p>
                        1) Stay in current group with the same teacher.
                      </p>
                      <p>
                        2) Move to the next house (
                        {nextHouseName(sub.class?.house?.name)
                          ? `House of ${houseDisplayName(
                              nextHouseName(sub.class?.house?.name),
                            )}`
                          : "choose another teacher/time"}
                        ) and choose teacher/time from schedule.
                      </p>
                      <p className="text-[var(--text-soft)]">
                        If same teacher has no higher-level slot yet, choose another
                        teacher/time in that next house (or wait for new schedule opening).
                      </p>
                      <Link
                        href={`/schedules?focusTeacher=${encodeURIComponent(
                          sub.class?.teacher.nickname ?? "",
                        )}&fromHouse=${encodeURIComponent(
                          sub.class?.house.name ?? "",
                        )}&fromLevel=${sub.class?.level ?? 1}&targetHouse=${encodeURIComponent(
                          nextHouseName(sub.class?.house?.name) ?? "",
                        )}`}
                        className="mt-1 inline-block font-semibold underline"
                      >
                        See schedules (same teacher first, then all teachers)
                      </Link>
                    </div>
                    <p>
                      Approved by {sub.slot9.teacher?.nickname ?? "Teacher"} •{" "}
                      {new Date(sub.slot9.decidedAt).toLocaleDateString()}
                    </p>
                    <a
                      href={sub.slot9.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Open duplicated image from slot 8
                    </a>
                    {sub.slot9.remark ? <p>Teacher remark: {sub.slot9.remark}</p> : null}
                    <p className="pt-1 font-semibold text-emerald-700">
                      Graduation approved. A promotion letter with next-group choices was sent to
                      your email.
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-[var(--text-soft)]">
                    Appears after teacher approves slot 8.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-soft)]">
          No subscriptions found yet, so upload slots are not available.
        </p>
      )}
    </section>
  );
}
