"use client";

import { useEffect, useState } from "react";

type Task = {
  id: string;
  type: "REPORT" | "FLAG";
  status: "OPEN" | "CLOSED";
  payloadJson: {
    targetType?: string;
    targetId?: string | null;
    reason?: string;
    context?: string | null;
    source?: string;
    matchedTerm?: string;
    category?: string;
    streamId?: string;
    message?: string;
  } | null;
  createdAt: string;
  createdBy?: {
    id: string;
    email: string;
    nickname: string;
  } | null;
  assignee?: {
    id: string;
    email: string;
    nickname: string;
  } | null;
};

type TasksResponse = {
  tasks?: Task[];
  error?: string;
};

export function ModerationQueueManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [typeFilter, setTypeFilter] = useState<"REPORT" | "FLAG" | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "CLOSED" | "ALL">("OPEN");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadTasks() {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("type", typeFilter);
      params.set("status", statusFilter);
      params.set("limit", "50");
      const res = await fetch(`/api/admin/moderation-tasks?${params.toString()}`);
      const data = (await res.json()) as TasksResponse;
      if (!res.ok) {
        setMessage(data.error ?? "Failed to load moderation queue.");
        return;
      }
      setTasks(data.tasks ?? []);
    } catch {
      setMessage("Unexpected network error.");
    } finally {
      setLoading(false);
    }
  }

  async function patchTask(
    taskId: string,
    payload: { status?: "OPEN" | "CLOSED"; assignToMe?: boolean; clearAssignee?: boolean },
  ) {
    setMessage(null);
    const res = await fetch(`/api/admin/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to update moderation task.");
      return;
    }
    setMessage("Moderation task updated.");
    await loadTasks();
  }

  useEffect(() => {
    void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter]);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Moderation queue</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Review user reports and moderator flags.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value as "REPORT" | "FLAG" | "ALL")
            }
            className="rounded border border-[var(--line)] p-2 text-sm"
          >
            <option value="ALL">All types</option>
            <option value="REPORT">Reports</option>
            <option value="FLAG">Flags</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "OPEN" | "CLOSED" | "ALL")
            }
            className="rounded border border-[var(--line)] p-2 text-sm"
          >
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="ALL">All statuses</option>
          </select>
          <button
            type="button"
            onClick={() => void loadTasks()}
            className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {message && <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>}
      {loading && <p className="mt-2 text-sm text-[var(--text-soft)]">Loading...</p>}

      <div className="mt-3 space-y-2">
        {!loading && !tasks.length && (
          <p className="text-sm text-[var(--text-soft)]">No moderation tasks found.</p>
        )}
        {tasks.map((task) => (
          <article key={task.id} className="rounded border border-[var(--line)] p-3 text-sm">
            <p className="font-semibold">
              {task.type} • {task.status}
            </p>
            <p className="text-[var(--text-soft)]">
              Task ID: {task.id} • Created: {new Date(task.createdAt).toLocaleString()}
            </p>
            <p className="text-[var(--text-soft)]">
              Reporter: {task.createdBy?.nickname ?? "Unknown"} (
              {task.createdBy?.email ?? "no email"})
            </p>
            <p className="text-[var(--text-soft)]">
              Assignee: {task.assignee?.nickname ?? "Unassigned"} (
              {task.assignee?.email ?? "-"})
            </p>
            <p className="mt-1">
              Target: {task.payloadJson?.targetType ?? "-"} /{" "}
              {task.payloadJson?.targetId ?? "-"}
            </p>
            {task.payloadJson?.source && (
              <p className="mt-1 text-[var(--text-soft)]">
                Source: {task.payloadJson.source}
                {task.payloadJson.streamId ? ` • Stream: ${task.payloadJson.streamId}` : ""}
              </p>
            )}
            {task.payloadJson?.matchedTerm && (
              <p className="mt-1 text-[var(--text-soft)]">
                Matched: {task.payloadJson.matchedTerm}
                {task.payloadJson.category ? ` (${task.payloadJson.category})` : ""}
              </p>
            )}
            <p className="mt-1 text-[var(--text-soft)]">
              Reason: {task.payloadJson?.reason ?? "-"}
            </p>
            {task.payloadJson?.context && (
              <p className="mt-1 text-[var(--text-soft)]">
                Context: {task.payloadJson.context}
              </p>
            )}
            {task.payloadJson?.message && (
              <p className="mt-1 text-[var(--text-soft)]">
                Message: {task.payloadJson.message}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {task.status === "OPEN" ? (
                <button
                  type="button"
                  onClick={() => void patchTask(task.id, { status: "CLOSED" })}
                  className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Close
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void patchTask(task.id, { status: "OPEN" })}
                  className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Reopen
                </button>
              )}
              <button
                type="button"
                onClick={() => void patchTask(task.id, { assignToMe: true })}
                className="rounded bg-[var(--cta-green)] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Assign to me
              </button>
              <button
                type="button"
                onClick={() => void patchTask(task.id, { clearAssignee: true })}
                className="rounded bg-[var(--cta-blue)] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Clear assignee
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
