"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type StreamRow = {
  id: string;
  type: "SCHOOL" | "GUEST";
  status: "LIVE" | "OFFLINE" | "ENDED";
  owner: { nickname: string; email: string };
  class: {
    house?: { name?: string | null } | null;
    level?: string | null;
    dayPattern?: string | null;
    time?: string | null;
    teacher?: { nickname?: string | null } | null;
  } | null;
};

type AssignmentRow = {
  id: string;
  status: "OPEN" | "CLOSED";
  streamId: string;
  streamType: "SCHOOL" | "GUEST";
  startsAt: string;
  endsAt: string;
  timezone: string;
  durationMinutes: number;
  note: string | null;
  roomLink: string;
  activeNow: boolean;
  createdBy: { nickname: string; email: string } | null;
};

export function ManualTrialAssignmentsManager() {
  const [streams, setStreams] = useState<StreamRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [streamId, setStreamId] = useState("");
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const streamById = useMemo(
    () => new Map(streams.map((stream) => [stream.id, stream])),
    [streams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [streamsRes, assignmentsRes] = await Promise.all([
        fetch("/api/admin/streams?status=ALL&type=ALL&limit=150"),
        fetch("/api/admin/manual-trials"),
      ]);
      const streamsData = (await streamsRes.json()) as { streams?: StreamRow[]; error?: string };
      const assignmentsData = (await assignmentsRes.json()) as {
        assignments?: AssignmentRow[];
        error?: string;
      };
      if (!streamsRes.ok) {
        setError(streamsData.error ?? "Failed to load streams.");
        return;
      }
      if (!assignmentsRes.ok) {
        setError(assignmentsData.error ?? "Failed to load trial assignments.");
        return;
      }
      const nextStreams = streamsData.streams ?? [];
      setStreams(nextStreams);
      setAssignments(assignmentsData.assignments ?? []);
      if (!streamId && nextStreams.length) {
        setStreamId(nextStreams[0].id);
      }
    } catch {
      setError("Failed to load trial assignments.");
    } finally {
      setLoading(false);
    }
  }, [streamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createAssignment() {
    if (!streamId) {
      setError("Select a stream first.");
      return;
    }
    if (!startsAtLocal) {
      setError("Pick start date/time.");
      return;
    }
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const startsAtIso = new Date(startsAtLocal).toISOString();
      const res = await fetch("/api/admin/manual-trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId,
          startsAt: startsAtIso,
          timezone,
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        assignment?: { roomLink?: string };
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to create assignment.");
        return;
      }
      setMessage(
        data.assignment?.roomLink
          ? `Created 20-minute trial link: ${data.assignment.roomLink}`
          : "Created 20-minute trial link.",
      );
      setNote("");
      await load();
    } catch {
      setError("Failed to create assignment.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleAssignment(assignmentId: string, nextOpen: boolean) {
    const res = await fetch(`/api/admin/manual-trials/${encodeURIComponent(assignmentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextOpen ? { reopen: true } : { cancel: true }),
    });
    if (res.ok) {
      await load();
    }
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <h2 className="text-xl font-semibold">Manual trial room links (20 minutes)</h2>
      <p className="mt-1 text-sm text-[var(--text-soft)]">
        Assign trial access by date/time + timezone to any teacher stream from admin board.
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

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <label className="text-xs">
          <span className="font-semibold">Stream / Teacher</span>
          <select
            value={streamId}
            onChange={(event) => setStreamId(event.target.value)}
            className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2 text-sm"
          >
            <option value="">Select stream</option>
            {streams.map((stream) => (
              <option key={stream.id} value={stream.id}>
                {stream.owner.nickname} • {stream.type} • {stream.status}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="font-semibold">Start date/time</span>
          <input
            type="datetime-local"
            value={startsAtLocal}
            onChange={(event) => setStartsAtLocal(event.target.value)}
            className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="font-semibold">Timezone mention</span>
          <input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2 text-sm"
            placeholder="e.g. Atlantic/Reykjavik"
          />
        </label>
        <label className="text-xs">
          <span className="font-semibold">Note (optional)</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2 text-sm"
            placeholder="Student name or context"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={creating || !streamId || !startsAtLocal}
        onClick={() => void createAssignment()}
        className="mt-3 rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {creating ? "Creating…" : "Create 20-minute trial link"}
      </button>

      {loading ? (
        <p className="mt-4 text-sm text-[var(--text-soft)]">Loading assignments…</p>
      ) : (
        <div className="mt-4 space-y-2">
          {assignments.map((assignment) => {
            const stream = streamById.get(assignment.streamId);
            return (
              <div key={assignment.id} className="rounded border border-[var(--line)] p-2 text-sm">
                <p className="font-semibold">
                  {stream?.owner.nickname ?? "Teacher"} • {assignment.streamType} •{" "}
                  {assignment.activeNow ? "ACTIVE NOW" : assignment.status}
                </p>
                <p className="text-xs text-[var(--text-soft)]">
                  {new Date(assignment.startsAt).toLocaleString()} →{" "}
                  {new Date(assignment.endsAt).toLocaleString()} ({assignment.timezone})
                </p>
                <p className="mt-1 break-all text-xs">
                  Link: <span className="font-semibold">{assignment.roomLink}</span>
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(assignment.roomLink)}
                    className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                  >
                    Copy link
                  </button>
                  {assignment.status === "OPEN" ? (
                    <button
                      type="button"
                      onClick={() => void toggleAssignment(assignment.id, false)}
                      className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void toggleAssignment(assignment.id, true)}
                      className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!assignments.length ? (
            <p className="text-sm text-[var(--text-soft)]">No manual trial links yet.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
