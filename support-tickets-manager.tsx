"use client";

import { useEffect, useState } from "react";

type Ticket = {
  id: string;
  status: "OPEN" | "CLOSED";
  payloadJson: {
    kind?: string;
    message?: string;
    numberOfStudents?: number;
    country?: string;
    preferredDaysTimes?: string;
    ageRange?: string;
    contactEmail?: string | null;
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

type TicketsResponse = {
  tickets?: Ticket[];
  error?: string;
};

export function SupportTicketsManager() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "CLOSED" | "ALL">("OPEN");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadTickets() {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      params.set("limit", "50");
      const res = await fetch(`/api/support/tickets?${params.toString()}`);
      const data = (await res.json()) as TicketsResponse;
      if (!res.ok) {
        setMessage(data.error ?? "Failed to load support tickets");
        return;
      }
      setTickets(data.tickets ?? []);
    } catch {
      setMessage("Unexpected network error.");
    } finally {
      setLoading(false);
    }
  }

  async function patchTicket(
    ticketId: string,
    payload: { status?: "OPEN" | "CLOSED"; assignToMe?: boolean; clearAssignee?: boolean },
  ) {
    setMessage(null);
    const res = await fetch(`/api/admin/tasks/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to update ticket");
      return;
    }
    setMessage("Ticket updated");
    await loadTickets();
  }

  async function createPackageFromTicket(ticketId: string) {
    setMessage(null);
    const res = await fetch("/api/admin/custom-group-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceSupportTaskId: ticketId,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to create seat package from ticket.");
      return;
    }
    setMessage("Seat package created from support ticket.");
  }

  useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Support tickets</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Manage Ask Question and Custom Class Order submissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "OPEN" | "CLOSED" | "ALL")
            }
            className="rounded border border-[var(--line)] p-2 text-sm"
          >
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="ALL">All</option>
          </select>
          <button
            type="button"
            onClick={() => void loadTickets()}
            className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {message && <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>}
      {loading && <p className="mt-2 text-sm text-[var(--text-soft)]">Loading...</p>}

      <div className="mt-3 space-y-2">
        {!loading && !tickets.length && (
          <p className="text-sm text-[var(--text-soft)]">No support tickets found.</p>
        )}

        {tickets.map((ticket) => {
          const payload = ticket.payloadJson;
          const isQuestion = payload?.kind === "question";
          return (
            <article key={ticket.id} className="rounded border border-[var(--line)] p-3 text-sm">
              <p className="font-semibold">
                {isQuestion ? "Question" : "Custom class order"} • {ticket.status}
              </p>
              <p className="text-[var(--text-soft)]">
                Ticket ID: {ticket.id} • Created:{" "}
                {new Date(ticket.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 text-[var(--text-soft)]">
                Submitter: {ticket.createdBy?.nickname ?? "Anonymous"} (
                {ticket.createdBy?.email ?? payload?.contactEmail ?? "no email"})
              </p>
              <p className="text-[var(--text-soft)]">
                Assignee: {ticket.assignee?.nickname ?? "Unassigned"} (
                {ticket.assignee?.email ?? "-"})
              </p>
              {isQuestion ? (
                <p className="mt-1">{payload?.message ?? "(empty)"}</p>
              ) : (
                <p className="mt-1 text-[var(--text-soft)]">
                  Seats: {payload?.numberOfStudents ?? "-"} • Country:{" "}
                  {payload?.country ?? "-"} • Preferred:{" "}
                  {payload?.preferredDaysTimes ?? "-"} • Age: {payload?.ageRange ?? "-"}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {ticket.status === "OPEN" ? (
                  <button
                    type="button"
                    onClick={() => void patchTicket(ticket.id, { status: "CLOSED" })}
                    className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Close
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void patchTicket(ticket.id, { status: "OPEN" })}
                    className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Reopen
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void patchTicket(ticket.id, { assignToMe: true })}
                  className="rounded bg-[var(--cta-green)] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Assign to me
                </button>
                <button
                  type="button"
                  onClick={() => void patchTicket(ticket.id, { clearAssignee: true })}
                  className="rounded bg-[var(--cta-blue)] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Clear assignee
                </button>
                {!isQuestion && (
                  <button
                    type="button"
                    onClick={() => void createPackageFromTicket(ticket.id)}
                    className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Create seat package
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
