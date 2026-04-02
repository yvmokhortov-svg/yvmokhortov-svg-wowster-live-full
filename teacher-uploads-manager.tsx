"use client";

import { useCallback, useEffect, useState } from "react";

type UploadRow = {
  id: string;
  slotIndex: number;
  imageUrl: string;
  feedbackText: string | null;
  tasksText: string | null;
  updatedAt: string;
  user: { id: string; nickname: string; email: string };
  class: {
    id: string;
    dayPattern: string;
    time: string;
    teacherId: string;
    teacher: { id: string; nickname: string };
    level: number;
    house: { name: string };
  };
  subscription: {
    id: string;
    tierPriceCents: number;
    status: string;
  };
};

type Draft = {
  feedbackText: string;
  tasksText: string;
};

export function TeacherUploadsManager() {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/uploads");
      const data = (await res.json()) as { uploads?: UploadRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load uploads.");
        return;
      }
      const rows = data.uploads ?? [];
      setUploads(rows);
      const nextDrafts: Record<string, Draft> = {};
      for (const row of rows) {
        nextDrafts[row.id] = {
          feedbackText: row.feedbackText ?? "",
          tasksText: row.tasksText ?? "",
        };
      }
      setDrafts(nextDrafts);
    } catch {
      setError("Failed to load uploads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(uploadId: string, graduationDecision?: "APPROVED" | "NOT_APPROVED") {
    const draft = drafts[uploadId] ?? { feedbackText: "", tasksText: "" };
    setSavingId(uploadId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/teacher/uploads/${encodeURIComponent(uploadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackText: draft.feedbackText,
          tasksText: draft.tasksText,
          graduationDecision,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }
      setMessage(
        graduationDecision
          ? `Saved and set graduation: ${graduationDecision}.`
          : "Teacher notes saved.",
      );
      await load();
    } catch {
      setError("Save failed.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Student slots review</h2>
        <button
          type="button"
          className="rounded border border-[var(--line)] px-3 py-1 text-xs font-semibold"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--text-soft)]">
        You can write feedback/tasks under each slot. For slot 8, you can set
        slot 9 graduation tile decision.
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
        <p className="mt-4 text-sm text-[var(--text-soft)]">Loading uploads…</p>
      ) : uploads.length ? (
        <div className="mt-4 space-y-3">
          {uploads.map((upload) => {
            const canSetGraduation = upload.slotIndex === 8;
            return (
              <article key={upload.id} className="rounded-lg border border-[var(--line)] p-3">
                <p className="text-sm font-semibold">
                  {upload.user.nickname} • ${upload.subscription.tierPriceCents / 100} • Slot{" "}
                  {upload.slotIndex}
                </p>
                <p className="mt-1 text-xs text-[var(--text-soft)]">
                  {upload.class.house.name} / Level {upload.class.level} •{" "}
                  {upload.class.dayPattern} {upload.class.time} • Teacher:{" "}
                  {upload.class.teacher.nickname}
                </p>
                <a
                  href={upload.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-semibold underline"
                >
                  Open student upload
                </a>

                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <label className="text-xs">
                    <span className="font-semibold">Feedback text</span>
                    <textarea
                      value={drafts[upload.id]?.feedbackText ?? ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [upload.id]: {
                            feedbackText: event.target.value,
                            tasksText: prev[upload.id]?.tasksText ?? "",
                          },
                        }))
                      }
                      rows={3}
                      className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1"
                    />
                  </label>
                  <label className="text-xs">
                    <span className="font-semibold">Tasks text</span>
                    <textarea
                      value={drafts[upload.id]?.tasksText ?? ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [upload.id]: {
                            feedbackText: prev[upload.id]?.feedbackText ?? "",
                            tasksText: event.target.value,
                          },
                        }))
                      }
                      rows={3}
                      className="mt-1 w-full rounded border border-[var(--line)] px-2 py-1"
                    />
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={savingId === upload.id}
                    onClick={() => void save(upload.id)}
                    className="rounded bg-zinc-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {savingId === upload.id ? "Saving…" : "Save notes"}
                  </button>
                  {canSetGraduation ? (
                    <>
                      <button
                        type="button"
                        disabled={savingId === upload.id}
                        onClick={() => void save(upload.id, "APPROVED")}
                        className="rounded border border-emerald-400 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                      >
                        Slot 9: Graduated
                      </button>
                      <button
                        type="button"
                        disabled={savingId === upload.id}
                        onClick={() => void save(upload.id, "NOT_APPROVED")}
                        className="rounded border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 disabled:opacity-50"
                      >
                        Slot 9: Not graduated
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-soft)]">No uploads found yet.</p>
      )}
    </section>
  );
}
