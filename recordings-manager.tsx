"use client";

import { useEffect, useState } from "react";

type RecordingRow = {
  id: string;
  streamId: string;
  status: "PROCESSING" | "READY" | "FAILED" | "EXPIRED";
  storageProvider: string;
  objectKey: string | null;
  downloadUrl: string | null;
  mimeType: string | null;
  sizeBytes: string | null;
  durationSeconds: number | null;
  recordedStartedAt: string | null;
  recordedEndedAt: string | null;
  availableAt: string | null;
  expiresAt: string;
  expiredAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  canDownload: boolean;
  downloadCount: number;
  stream: {
    id: string;
    type: "SCHOOL" | "GUEST";
    status: "LIVE" | "OFFLINE" | "ENDED";
    roomName: string;
    startedAt: string | null;
    endedAt: string | null;
    owner: {
      id: string;
      email: string;
      nickname: string;
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
  };
};

type RecordingsResponse = {
  recordings?: RecordingRow[];
  error?: string;
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "-";
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = seconds % 60;
  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function formatBytes(input: string | null): string {
  if (!input) return "-";
  const n = Number(input);
  if (!Number.isFinite(n)) return input;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function RecordingsManager() {
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PROCESSING" | "READY" | "FAILED" | "EXPIRED"
  >("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "SCHOOL" | "GUEST">("ALL");
  const [loading, setLoading] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadRecordings() {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        type: typeFilter,
        limit: "160",
        runRetention: "true",
      });
      const res = await fetch(`/api/admin/recordings?${params.toString()}`);
      const data = (await res.json()) as RecordingsResponse;
      if (!res.ok) {
        setMessage(data.error ?? "Failed to load recordings.");
        return;
      }
      setRecordings(data.recordings ?? []);
    } catch {
      setMessage("Failed to load recordings.");
    } finally {
      setLoading(false);
    }
  }

  async function runCleanup() {
    setCleanupRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/recordings/retention-cleanup", {
        method: "POST",
      });
      const data = (await res.json()) as { expiredCount?: number; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Failed to run retention cleanup.");
        return;
      }
      setMessage(`Retention cleanup complete. Expired recordings: ${data.expiredCount ?? 0}.`);
      await loadRecordings();
    } catch {
      setMessage("Failed to run retention cleanup.");
    } finally {
      setCleanupRunning(false);
    }
  }

  useEffect(() => {
    void loadRecordings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Recordings (admin download only)</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Every stream is recorded. Files stay available for 30 days from stream end.
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
              setStatusFilter(
                event.target.value as "ALL" | "PROCESSING" | "READY" | "FAILED" | "EXPIRED",
              )
            }
            className="rounded border border-[var(--line)] p-2 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="PROCESSING">Processing</option>
            <option value="READY">Ready</option>
            <option value="FAILED">Failed</option>
            <option value="EXPIRED">Expired</option>
          </select>
          <button
            type="button"
            onClick={() => void loadRecordings()}
            className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={cleanupRunning}
            onClick={() => void runCleanup()}
            className="rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {cleanupRunning ? "Cleaning..." : "Run 30-day cleanup"}
          </button>
        </div>
      </div>

      {message && <p className="mt-3 text-sm text-[var(--text-soft)]">{message}</p>}
      {loading && <p className="mt-3 text-sm text-[var(--text-soft)]">Loading recordings...</p>}

      <div className="mt-3 space-y-2">
        {!loading && !recordings.length && (
          <p className="text-sm text-[var(--text-soft)]">No recordings found.</p>
        )}
        {recordings.map((recording) => (
          <article key={recording.id} className="rounded border border-[var(--line)] p-3 text-sm">
            <p className="font-semibold">
              {recording.stream.type} • {recording.status} • {recording.stream.roomName}
            </p>
            <p className="text-[var(--text-soft)]">
              Owner: {recording.stream.owner.nickname} ({recording.stream.owner.email}) •
              Duration: {formatDuration(recording.durationSeconds)} • Size:{" "}
              {formatBytes(recording.sizeBytes)}
            </p>
            <p className="text-[var(--text-soft)]">
              Available: {recording.availableAt ? new Date(recording.availableAt).toLocaleString() : "-"}
              {" • "}
              Expires: {new Date(recording.expiresAt).toLocaleString()}
              {" • "}
              Downloads: {recording.downloadCount}
            </p>
            {recording.stream.class && (
              <p className="mt-1 text-[var(--text-soft)]">
                Class: {recording.stream.class.house.name} • Level {recording.stream.class.level}
                {" • "}
                {recording.stream.class.dayPattern} {recording.stream.class.time} • Teacher:{" "}
                {recording.stream.class.teacher.nickname}
              </p>
            )}
            {recording.failureReason && (
              <p className="mt-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
                {recording.failureReason}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!recording.canDownload}
                onClick={() =>
                  window.open(
                    `/api/admin/recordings/${encodeURIComponent(recording.id)}/download`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                className="rounded border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-50"
              >
                Download
              </button>
              {recording.objectKey && (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(recording.objectKey!)}
                  className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                >
                  Copy object key
                </button>
              )}
              <span className="rounded bg-slate-100 px-2 py-1 text-xs text-[var(--text-soft)]">
                Stream ID: {recording.streamId}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
