"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Candidate = {
  graduationId: string;
  monthKey: string;
  graduationUploadId: string;
  studentUserId: string;
  nickname: string;
  avatarUrl: string | null;
  country: string | null;
  imageUrl: string;
  remark: string | null;
};

type Slot = {
  id: string;
  monthKey: string;
  slotIndex: number;
  graduationUploadId: string | null;
  studentUserId: string;
  studentUser: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
    country: string | null;
  };
  upload: {
    id: string;
    imageUrl: string;
    feedbackText: string | null;
    tasksText: string | null;
  } | null;
};

function monthKeyUtc(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function FeaturedGraduatesManager() {
  const [monthKey, setMonthKey] = useState(monthKeyUtc());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [slotIndex, setSlotIndex] = useState(1);
  const [candidateKey, setCandidateKey] = useState("");
  const [consentNote, setConsentNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const candidateMap = useMemo(
    () =>
      new Map(
        candidates.map((candidate) => [
          `${candidate.graduationUploadId}:${candidate.studentUserId}`,
          candidate,
        ]),
      ),
    [candidates],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/featured-slots?monthKey=${encodeURIComponent(monthKey)}`,
      );
      const data = (await res.json()) as {
        monthKey?: string;
        slots?: Slot[];
        candidates?: Candidate[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to load featured slots.");
        return;
      }
      setMonthKey(data.monthKey ?? monthKeyUtc());
      setSlots(data.slots ?? []);
      setCandidates(data.candidates ?? []);
      if (!candidateKey && data.candidates?.length) {
        const first = data.candidates[0];
        setCandidateKey(`${first.graduationUploadId}:${first.studentUserId}`);
      }
    } catch {
      setError("Failed to load featured slots.");
    } finally {
      setLoading(false);
    }
  }, [candidateKey, monthKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assignSlot() {
    const selected = candidateMap.get(candidateKey);
    if (!selected) {
      setError("Select candidate first.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/featured-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthKey,
          slotIndex,
          graduationUploadId: selected.graduationUploadId,
          studentUserId: selected.studentUserId,
          parentConsentNote: consentNote || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to assign slot.");
        return;
      }
      setMessage(`Assigned slot ${slotIndex}.`);
      await load();
    } catch {
      setError("Failed to assign slot.");
    } finally {
      setSaving(false);
    }
  }

  async function clearSlot(index: number) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/featured-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthKey,
          slotIndex: index,
          clear: true,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to clear slot.");
        return;
      }
      setMessage(`Cleared slot ${index}.`);
      await load();
    } catch {
      setError("Failed to clear slot.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <h2 className="text-xl font-semibold">Featured graduates (Home stripe)</h2>
      <p className="mt-1 text-sm text-[var(--text-soft)]">
        Assign approved graduation uploads to monthly slots (1..30). Stripe is hidden on
        Home when no slot is assigned.
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

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <label className="text-xs">
          <span className="font-semibold">Month</span>
          <input
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value)}
            className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2"
            placeholder="YYYY-MM"
          />
        </label>
        <label className="text-xs">
          <span className="font-semibold">Slot index</span>
          <input
            type="number"
            min={1}
            max={30}
            value={slotIndex}
            onChange={(event) => setSlotIndex(Number(event.target.value))}
            className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2"
          />
        </label>
        <label className="text-xs md:col-span-2">
          <span className="font-semibold">Candidate (approved graduation)</span>
          <select
            value={candidateKey}
            onChange={(event) => setCandidateKey(event.target.value)}
            className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2 text-sm"
          >
            <option value="">Select candidate</option>
            {candidates.map((candidate) => (
              <option
                key={`${candidate.graduationUploadId}:${candidate.studentUserId}`}
                value={`${candidate.graduationUploadId}:${candidate.studentUserId}`}
              >
                {candidate.nickname} • {candidate.country ?? "Country hidden"} •{" "}
                {candidate.monthKey}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block text-xs">
        <span className="font-semibold">Parent consent note</span>
        <textarea
          rows={2}
          value={consentNote}
          onChange={(event) => setConsentNote(event.target.value)}
          className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2"
          placeholder="Consent reference, email date, etc."
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void assignSlot()}
          className="rounded bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Assign slot"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void load()}
          className="rounded border border-[var(--line)] px-3 py-2 text-xs font-semibold"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-[var(--text-soft)]">Loading featured slots…</p>
      ) : (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {Array.from({ length: 30 }).map((_, i) => {
            const index = i + 1;
            const slot = slots.find((row) => row.slotIndex === index) ?? null;
            return (
              <article key={index} className="rounded border border-[var(--line)] p-2 text-xs">
                <p className="font-semibold">Slot {index}</p>
                {slot ? (
                  <div className="mt-1 space-y-1">
                    <p>{slot.studentUser.nickname}</p>
                    {slot.upload ? (
                      <a
                        href={slot.upload.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Open graduation image
                      </a>
                    ) : (
                      <p className="text-[var(--text-soft)]">Upload unavailable</p>
                    )}
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void clearSlot(index)}
                      className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-[var(--text-soft)]">Empty</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
