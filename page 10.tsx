"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type SeatPayload = {
  id: string;
  seatIndex: number;
  status: "AVAILABLE" | "CLAIMED" | "CANCELED";
  invitedEmail: string | null;
  claimedAt: string | null;
  claimedByUser: {
    id: string;
    email: string;
    nickname: string;
  } | null;
};

type OrderPayload = {
  id: string;
  status: "DRAFT" | "CHECKOUT_SENT" | "PAID" | "ACTIVE" | "CLOSED" | "CANCELED";
  numberOfSeats: number;
  claimedSeats: number;
  country: string;
  preferredDaysTimes: string;
  ageRange: string;
  contactEmail: string | null;
  note: string | null;
  groupAdmin: {
    id: string;
    email: string;
    nickname: string;
  } | null;
};

type CurrentUser = {
  id: string;
  email: string;
  nickname: string;
  role: string;
} | null;

function ClaimSeatContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [seat, setSeat] = useState<SeatPayload | null>(null);
  const [order, setOrder] = useState<OrderPayload | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser>(null);
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadSeat() {
    if (!token) {
      setMessage("Seat claim token is missing.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ token });
      const res = await fetch(`/api/custom-group-seats/claim?${params.toString()}`);
      const data = (await res.json()) as {
        seat?: SeatPayload;
        order?: OrderPayload;
        currentUser?: CurrentUser;
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? "Failed to load claim link.");
        return;
      }
      setSeat(data.seat ?? null);
      setOrder(data.order ?? null);
      setCurrentUser(data.currentUser ?? null);
      if (data.currentUser?.email) {
        setEmail(data.currentUser.email);
      }
      if (data.currentUser?.nickname) {
        setNickname(data.currentUser.nickname);
      }
    } catch {
      setMessage("Failed to load claim link.");
    } finally {
      setLoading(false);
    }
  }

  async function claimSeat(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!token) {
      setMessage("Seat claim token is missing.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/custom-group-seats/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: currentUser ? undefined : email || undefined,
          nickname: currentUser ? undefined : nickname || undefined,
          password: currentUser ? undefined : password || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Failed to claim seat.");
        return;
      }
      setMessage("Seat claimed successfully.");
      setPassword("");
      await loadSeat();
    } catch {
      setMessage("Failed to claim seat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSeat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const seatAlreadyClaimed = seat?.status !== "AVAILABLE";
  const orderReady = order?.status === "PAID" || order?.status === "ACTIVE";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Claim your group seat</h1>
      <p className="text-sm text-[var(--text-soft)]">
        Use this page to claim a seat from your school/group package.
      </p>

      {loading && <p className="text-sm text-[var(--text-soft)]">Loading...</p>}
      {message && <p className="text-sm text-[var(--text-soft)]">{message}</p>}

      {seat && order && (
        <section className="rounded-xl border border-[var(--line)] bg-white p-4 text-sm">
          <p className="font-semibold">
            Seat #{seat.seatIndex} • {seat.status}
          </p>
          <p className="text-[var(--text-soft)]">
            Package status: {order.status} • Claimed {order.claimedSeats}/{order.numberOfSeats}
          </p>
          <p className="mt-1 text-[var(--text-soft)]">
            Country: {order.country} • Preferred: {order.preferredDaysTimes} • Age: {order.ageRange}
          </p>
          {order.groupAdmin && (
            <p className="mt-1 text-[var(--text-soft)]">
              Group admin: {order.groupAdmin.nickname} ({order.groupAdmin.email})
            </p>
          )}
          {seat.claimedByUser && (
            <p className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-700">
              Claimed by {seat.claimedByUser.nickname} ({seat.claimedByUser.email})
            </p>
          )}
          {!orderReady && (
            <p className="mt-2 rounded border border-yellow-300 bg-yellow-50 px-2 py-1 text-yellow-700">
              This seat package is not paid/active yet. Ask group admin to complete checkout first.
            </p>
          )}
        </section>
      )}

      {!seatAlreadyClaimed && orderReady && (
        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          {!currentUser ? (
            <form onSubmit={claimSeat} className="space-y-2">
              <p className="text-sm font-semibold">Create student account and claim seat</p>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded border border-[var(--line)] p-2 text-sm"
                placeholder="Email"
                required
              />
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="w-full rounded border border-[var(--line)] p-2 text-sm"
                placeholder="Nickname"
                required
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded border border-[var(--line)] p-2 text-sm"
                placeholder="Password (min 8)"
                minLength={8}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Claim seat
              </button>
            </form>
          ) : (
            <div className="space-y-2 text-sm">
              <p>
                Signed in as {currentUser.nickname} ({currentUser.email})
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => void claimSeat()}
                className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Claim this seat
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function ClaimSeatPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl p-4 text-sm text-[var(--text-soft)]">Loading seat claim...</div>}>
      <ClaimSeatContent />
    </Suspense>
  );
}
