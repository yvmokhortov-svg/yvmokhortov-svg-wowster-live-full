"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SupportTicket = {
  id: string;
  status: "OPEN" | "CLOSED";
  payloadJson: {
    kind?: string;
    numberOfStudents?: number;
    country?: string;
    preferredDaysTimes?: string;
    ageRange?: string;
    contactEmail?: string | null;
  } | null;
  createdAt: string;
};

type CustomGroupOrder = {
  id: string;
  sourceSupportTaskId: string | null;
  status: "DRAFT" | "CHECKOUT_SENT" | "PAID" | "ACTIVE" | "CLOSED" | "CANCELED";
  numberOfSeats: number;
  claimedSeats: number;
  country: string;
  preferredDaysTimes: string;
  ageRange: string;
  note: string | null;
  contactEmail: string | null;
  seatPriceCents: number;
  totalAmountCents: number;
  checkoutUrl: string | null;
  checkoutReference: string | null;
  createdAt: string;
  groupAdmin: { id: string; email: string; nickname: string } | null;
  seats: Array<{
    id: string;
    seatIndex: number;
    status: "AVAILABLE" | "CLAIMED" | "CANCELED";
    claimToken: string;
    invitedEmail: string | null;
    claimedByUser: { id: string; email: string; nickname: string } | null;
  }>;
};

export function CustomGroupOrdersManager() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [orders, setOrders] = useState<CustomGroupOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "DRAFT" | "CHECKOUT_SENT" | "PAID" | "ACTIVE" | "CLOSED" | "CANCELED"
  >("ALL");
  const [selectedSupportTaskId, setSelectedSupportTaskId] = useState("");
  const [manualSeats, setManualSeats] = useState(10);
  const [manualCountry, setManualCountry] = useState("");
  const [manualPreferred, setManualPreferred] = useState("");
  const [manualAgeRange, setManualAgeRange] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [seatPriceCents, setSeatPriceCents] = useState(2500);
  const [groupAdminEmail, setGroupAdminEmail] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const claimBase = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  async function loadAll() {
    setLoading(true);
    setMessage(null);
    try {
      const [ticketsRes, ordersRes] = await Promise.all([
        fetch("/api/support/tickets?status=OPEN&limit=100"),
        fetch(`/api/admin/custom-group-orders?status=${statusFilter}&limit=80`),
      ]);
      const ticketsData = (await ticketsRes.json()) as {
        tickets?: SupportTicket[];
        error?: string;
      };
      const ordersData = (await ordersRes.json()) as {
        orders?: CustomGroupOrder[];
        error?: string;
      };
      if (!ticketsRes.ok) {
        setMessage(ticketsData.error ?? "Failed to load support tickets.");
        return;
      }
      if (!ordersRes.ok) {
        setMessage(ordersData.error ?? "Failed to load custom group orders.");
        return;
      }
      const customTickets = (ticketsData.tickets ?? []).filter(
        (ticket) => ticket.payloadJson?.kind === "custom_class_order",
      );
      setTickets(customTickets);
      setOrders(ordersData.orders ?? []);
      if (!selectedSupportTaskId && customTickets.length) {
        setSelectedSupportTaskId(customTickets[0].id);
      }
    } catch {
      setMessage("Failed to load custom group orders.");
    } finally {
      setLoading(false);
    }
  }

  async function createFromTicket() {
    if (!selectedSupportTaskId) {
      setMessage("Pick a support ticket first.");
      return;
    }
    const res = await fetch("/api/admin/custom-group-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceSupportTaskId: selectedSupportTaskId,
        seatPriceCents,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to create custom group order from ticket.");
      return;
    }
    setMessage("Custom group order created from support ticket.");
    await loadAll();
  }

  async function createManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch("/api/admin/custom-group-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numberOfSeats: manualSeats,
        country: manualCountry,
        preferredDaysTimes: manualPreferred,
        ageRange: manualAgeRange,
        contactEmail: manualEmail || undefined,
        note: manualNote || undefined,
        seatPriceCents,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to create manual custom group order.");
      return;
    }
    setMessage("Custom group order created.");
    setManualSeats(10);
    setManualCountry("");
    setManualPreferred("");
    setManualAgeRange("");
    setManualEmail("");
    setManualNote("");
    await loadAll();
  }

  async function patchOrder(
    orderId: string,
    payload: Record<string, unknown>,
    okMessage: string,
  ) {
    const res = await fetch(`/api/admin/custom-group-orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to update order.");
      return;
    }
    setMessage(okMessage);
    await loadAll();
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Custom group seats lifecycle (10+)</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Convert support orders into seat packages, assign group admin, manage checkout and claim links.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as
                  | "ALL"
                  | "DRAFT"
                  | "CHECKOUT_SENT"
                  | "PAID"
                  | "ACTIVE"
                  | "CLOSED"
                  | "CANCELED",
              )
            }
            className="rounded border border-[var(--line)] p-2 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="CHECKOUT_SENT">Checkout sent</option>
            <option value="PAID">Paid</option>
            <option value="ACTIVE">Active</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELED">Canceled</option>
            <option value="DRAFT">Draft</option>
          </select>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="mt-2 text-sm text-[var(--text-soft)]">Loading…</p>}
      {message && <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Create from support ticket</p>
          <select
            value={selectedSupportTaskId}
            onChange={(event) => setSelectedSupportTaskId(event.target.value)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
          >
            <option value="">Select custom class order ticket</option>
            {tickets.map((ticket) => (
              <option key={ticket.id} value={ticket.id}>
                {ticket.id} • seats {ticket.payloadJson?.numberOfStudents ?? "-"} •{" "}
                {ticket.payloadJson?.country ?? "-"}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={100}
            value={seatPriceCents}
            onChange={(event) => setSeatPriceCents(Number(event.target.value))}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Seat price cents"
          />
          <button
            type="button"
            onClick={() => void createFromTicket()}
            className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white"
          >
            Create package from ticket
          </button>
        </div>

        <form onSubmit={createManual} className="space-y-2 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-semibold">Create manual package</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={10}
              value={manualSeats}
              onChange={(event) => setManualSeats(Number(event.target.value))}
              className="rounded border border-[var(--line)] p-2 text-sm"
              placeholder="Seats"
              required
            />
            <input
              value={manualCountry}
              onChange={(event) => setManualCountry(event.target.value)}
              className="rounded border border-[var(--line)] p-2 text-sm"
              placeholder="Country"
              required
            />
          </div>
          <input
            value={manualPreferred}
            onChange={(event) => setManualPreferred(event.target.value)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Preferred days/times"
            required
          />
          <input
            value={manualAgeRange}
            onChange={(event) => setManualAgeRange(event.target.value)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Age range"
            required
          />
          <input
            type="email"
            value={manualEmail}
            onChange={(event) => setManualEmail(event.target.value)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Contact email (optional)"
          />
          <textarea
            value={manualNote}
            onChange={(event) => setManualNote(event.target.value)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            rows={2}
            placeholder="Note (optional)"
          />
          <button className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white">
            Create manual package
          </button>
        </form>
      </div>

      <div className="mt-4 space-y-3">
        {!orders.length && <p className="text-sm text-[var(--text-soft)]">No custom seat packages yet.</p>}
        {orders.map((order) => (
          <article key={order.id} className="rounded border border-[var(--line)] p-3 text-sm">
            <p className="font-semibold">
              Order {order.id} • {order.status}
            </p>
            <p className="text-[var(--text-soft)]">
              Seats claimed {order.claimedSeats}/{order.numberOfSeats} • Total $
              {(order.totalAmountCents / 100).toFixed(2)} • Seat $
              {(order.seatPriceCents / 100).toFixed(2)}
            </p>
            <p className="text-[var(--text-soft)]">
              Country: {order.country} • Preferred: {order.preferredDaysTimes} • Age: {order.ageRange}
            </p>
            {order.checkoutUrl && (
              <p className="mt-1 break-all text-[var(--text-soft)]">Checkout: {order.checkoutUrl}</p>
            )}
            <p className="text-[var(--text-soft)]">
              Group admin:{" "}
              {order.groupAdmin
                ? `${order.groupAdmin.nickname} (${order.groupAdmin.email})`
                : "Unassigned"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={groupAdminEmail[order.id] ?? ""}
                onChange={(event) =>
                  setGroupAdminEmail((prev) => ({
                    ...prev,
                    [order.id]: event.target.value,
                  }))
                }
                className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                placeholder="Assign group admin by email"
              />
              <button
                type="button"
                onClick={() =>
                  void patchOrder(
                    order.id,
                    { assignGroupAdminEmail: groupAdminEmail[order.id] },
                    "Group admin assigned.",
                  )
                }
                className="rounded bg-[var(--cta-blue)] px-2 py-1 text-xs font-semibold text-white"
              >
                Assign admin
              </button>
              <button
                type="button"
                onClick={() => void patchOrder(order.id, { clearGroupAdmin: true }, "Group admin cleared.")}
                className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-white"
              >
                Clear admin
              </button>
              <button
                type="button"
                onClick={() => void patchOrder(order.id, { markPaid: true }, "Order marked paid.")}
                className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white"
              >
                Mark paid
              </button>
              <button
                type="button"
                onClick={() => void patchOrder(order.id, { activate: true }, "Order activated.")}
                className="rounded bg-indigo-700 px-2 py-1 text-xs font-semibold text-white"
              >
                Activate
              </button>
              <button
                type="button"
                onClick={() =>
                  void patchOrder(
                    order.id,
                    { regenerateCheckoutLink: true },
                    "Checkout link regenerated.",
                  )
                }
                className="rounded bg-zinc-800 px-2 py-1 text-xs font-semibold text-white"
              >
                Regenerate checkout
              </button>
              <button
                type="button"
                onClick={() => void patchOrder(order.id, { close: true }, "Order closed.")}
                className="rounded bg-zinc-800 px-2 py-1 text-xs font-semibold text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void patchOrder(order.id, { cancel: true }, "Order canceled.")}
                className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white"
              >
                Cancel
              </button>
            </div>
            <div className="mt-2 rounded border border-[var(--line)] p-2">
              <p className="text-xs font-semibold">Seat claim links</p>
              <div className="mt-1 grid gap-1 md:grid-cols-2">
                {order.seats.map((seat) => {
                  const claimUrl = `${claimBase}/claim-seat?token=${encodeURIComponent(seat.claimToken)}`;
                  return (
                    <div key={seat.id} className="rounded border border-[var(--line)] p-1.5 text-xs">
                      <p>
                        Seat #{seat.seatIndex} • {seat.status}
                      </p>
                      {seat.claimedByUser ? (
                        <p className="text-[var(--text-soft)]">
                          {seat.claimedByUser.nickname} ({seat.claimedByUser.email})
                        </p>
                      ) : (
                        <p className="truncate text-[var(--text-soft)]">{claimUrl}</p>
                      )}
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(claimUrl)}
                        className="mt-1 rounded border border-[var(--line)] px-1.5 py-0.5"
                      >
                        Copy link
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
