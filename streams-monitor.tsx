"use client";

import { useEffect, useState } from "react";

type StreamRow = {
  id: string;
  type: "SCHOOL" | "GUEST";
  status: "LIVE" | "OFFLINE" | "ENDED";
  roomName: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  durationSeconds: number | null;
  owner: {
    id: string;
    email: string;
    nickname: string;
    role: string;
  };
  class: {
    id: string;
    level: number;
    dayPattern: string;
    time: string;
    lessonMinutes: number;
    house: { name: string };
    teacher: { id: string; nickname: string };
  } | null;
  recording: {
    id: string;
    status: "PROCESSING" | "READY" | "FAILED" | "EXPIRED";
    availableAt: string | null;
    expiresAt: string;
  } | null;
};

type ResponsePayload = {
  streams?: StreamRow[];
  error?: string;
};

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds == null) return "-";
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function StreamsMonitor() {
  const [streams, setStreams] = useState<StreamRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "LIVE" | "OFFLINE" | "ENDED">("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "SCHOOL" | "GUEST">("ALL");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadStreams() {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        type: typeFilter,
        limit: "120",
      });
      const res = await fetch(`/api/admin/streams?${params.toString()}`);
      const data = (await res.json()) as ResponsePayload;
      if (!res.ok) {
        setMessage(data.error ?? "Failed to load stream monitor.");
        return;
      }
      setStreams(data.streams ?? []);
    } catch {
      setMessage("Failed to load stream monitor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStreams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Streams monitor</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Track stream start/end state and session durations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as "ALL" | "SCHOOL" | "GUEST")}
            className="rounded border border-[var(--line)] p-2 text-sm"
          >
            <option value="ALL">All types</option>
            <option value="SCHOOL">School</option>
            <option value="GUEST">Guest</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "ALL" | "LIVE" | "OFFLINE" | "ENDED")
            }
            className="rounded border border-[var(--line)] p-2 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="LIVE">Live</option>
            <option value="OFFLINE">Offline</option>
            <option value="ENDED">Ended</option>
          </select>
          <button
            type="button"
            onClick={() => void loadStreams()}
            className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {message && <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>}
      {loading && <p className="mt-2 text-sm text-[var(--text-soft)]">Loading...</p>}

      <div className="mt-3 space-y-2">
        {!loading && !streams.length && (
          <p className="text-sm text-[var(--text-soft)]">No streams found.</p>
        )}
        {streams.map((stream) => (
          <article key={stream.id} className="rounded border border-[var(--line)] p-3 text-sm">
            <p className="font-semibold">
              {stream.type} • {stream.status} • {stream.roomName}
            </p>
            <p className="text-[var(--text-soft)]">
              Owner: {stream.owner.nickname} ({stream.owner.email}) • Duration:{" "}
              {formatDuration(stream.durationSeconds)}
            </p>
            <p className="text-[var(--text-soft)]">
              Started: {stream.startedAt ? new Date(stream.startedAt).toLocaleString() : "-"} •
              Ended: {stream.endedAt ? new Date(stream.endedAt).toLocaleString() : "-"}
            </p>
            <p className="text-[var(--text-soft)]">
              Recording:{" "}
              {stream.recording
                ? `${stream.recording.status}${
                    stream.recording.availableAt
                      ? ` • ready ${new Date(stream.recording.availableAt).toLocaleString()}`
                      : ""
                  } • expires ${new Date(stream.recording.expiresAt).toLocaleDateString()}`
                : "not started"}
            </p>
            {stream.class && (
              <p className="mt-1 text-[var(--text-soft)]">
                Class: {stream.class.house.name} • Level {stream.class.level} •{" "}
                {stream.class.dayPattern} {stream.class.time} • Teacher:{" "}
                {stream.class.teacher.nickname}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
