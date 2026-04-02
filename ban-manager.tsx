"use client";

import { FormEvent, useMemo, useState } from "react";

type BanRow = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  bannedAt: string | null;
  active: boolean;
  status?: "BANNED" | "CANCELLED";
  isPermanent?: boolean;
  banMeta?: {
    source?: string | null;
    reason?: string | null;
    createdAt?: string | null;
    bannedBy?: {
      id?: string | null;
      email?: string | null;
      nickname?: string | null;
    } | null;
  } | null;
};

function defaultMonthEndDateInput(): string {
  const now = new Date();
  const monthEndUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  return monthEndUtc.toISOString().slice(0, 10);
}

function dateInputToIsoEndOfDay(value: string): string {
  return `${value}T23:59:59.999Z`;
}

export function BanManager() {
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [permanent, setPermanent] = useState(false);
  const [includeCancelled, setIncludeCancelled] = useState(true);
  const [viewFilter, setViewFilter] = useState<
    "ALL" | "BANNED" | "CANCELLED" | "PERMANENT" | "SYSTEM" | "MANUAL"
  >("ALL");
  const [searchText, setSearchText] = useState("");
  const [bannedUntilDate, setBannedUntilDate] = useState(defaultMonthEndDateInput());
  const [message, setMessage] = useState<string | null>(null);
  const [bans, setBans] = useState<BanRow[]>([]);
  const hasTarget = useMemo(() => !!(userId.trim() || email.trim()), [userId, email]);
  const filteredBans = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return bans.filter((ban) => {
      const source = ban.banMeta?.source ?? "";
      const status = ban.status ?? (ban.active ? "BANNED" : "CANCELLED");
      const matchesFilter =
        viewFilter === "ALL"
          ? true
          : viewFilter === "BANNED"
            ? status === "BANNED"
            : viewFilter === "CANCELLED"
              ? status === "CANCELLED"
              : viewFilter === "PERMANENT"
                ? !!ban.isPermanent
                : viewFilter === "SYSTEM"
                  ? source === "policy_auto_ban"
                  : source === "admin_manual_ban" ||
                    source === "admin_manual_ban_update";
      if (!matchesFilter) return false;
      if (!q) return true;
      return (
        ban.nickname.toLowerCase().includes(q) ||
        ban.email.toLowerCase().includes(q) ||
        (ban.banMeta?.bannedBy?.nickname ?? "").toLowerCase().includes(q) ||
        source.toLowerCase().includes(q)
      );
    });
  }, [bans, searchText, viewFilter]);

  async function loadBans() {
    setMessage(null);
    const params = new URLSearchParams({
      includeCancelled: includeCancelled ? "true" : "false",
    });
    const res = await fetch(`/api/admin/bans?${params.toString()}`);
    const data = (await res.json()) as { bans?: BanRow[]; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to load bans.");
      return;
    }
    setBans(data.bans ?? []);
  }

  async function onBan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasTarget) {
      setMessage("Provide userId or email.");
      return;
    }
    setMessage(null);
    const res = await fetch("/api/admin/bans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId || undefined,
        email: email || undefined,
        bannedUntil: dateInputToIsoEndOfDay(bannedUntilDate),
        permanent,
        reason: reason || undefined,
      }),
    });
    const data = (await res.json()) as { error?: string; bannedUser?: BanRow };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to apply ban.");
      return;
    }
    setMessage("User banned successfully.");
    await loadBans();
  }

  async function unbanTarget(target: { userId?: string; email?: string }) {
    setMessage(null);
    const res = await fetch("/api/admin/bans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: target.userId,
        email: target.email,
        clear: true,
        reason: "Manual unban by admin",
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to unban user.");
      return;
    }
    setMessage("User unbanned.");
    await loadBans();
  }

  async function makeForever(target: { userId?: string; email?: string }) {
    setMessage(null);
    const res = await fetch("/api/admin/bans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: target.userId,
        email: target.email,
        permanent: true,
        reason: "Manual permanent ban by admin",
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to set permanent ban.");
      return;
    }
    setMessage("Permanent ban applied.");
    await loadBans();
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <h2 className="text-xl font-semibold">Manual bans manager</h2>
      <p className="mt-1 text-sm text-[var(--text-soft)]">
        Separate admin control for bans. Default ban date is end of current month (28-31).
      </p>

      <form onSubmit={onBan} className="mt-3 grid gap-2 md:grid-cols-2">
        <input
          className="rounded border border-[var(--line)] p-2 text-sm"
          placeholder="User ID (optional)"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        />
        <input
          className="rounded border border-[var(--line)] p-2 text-sm"
          placeholder="Email (optional)"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className="rounded border border-[var(--line)] p-2 text-sm"
          type="date"
          value={bannedUntilDate}
          onChange={(event) => setBannedUntilDate(event.target.value)}
          required={!permanent}
          disabled={permanent}
        />
        <button
          type="button"
          onClick={() => setBannedUntilDate(defaultMonthEndDateInput())}
          className="rounded border border-[var(--line)] p-2 text-sm disabled:opacity-60"
          disabled={permanent}
        >
          Set end of month
        </button>
        <label className="flex items-center gap-2 rounded border border-[var(--line)] p-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={permanent}
            onChange={(event) => setPermanent(event.target.checked)}
          />
          Make ban permanent (forever)
        </label>
        <input
          className="rounded border border-[var(--line)] p-2 text-sm md:col-span-2"
          placeholder="Reason (optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <button className="rounded bg-zinc-800 px-3 py-2 text-sm font-semibold text-white md:col-span-2">
          Ban user
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeCancelled}
            onChange={(event) => setIncludeCancelled(event.target.checked)}
          />
          Include cancelled bans
        </label>
        <button
          type="button"
          onClick={loadBans}
          className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
        >
          Refresh bans
        </button>
        <select
          value={viewFilter}
          onChange={(event) =>
            setViewFilter(
              event.target.value as
                | "ALL"
                | "BANNED"
                | "CANCELLED"
                | "PERMANENT"
                | "SYSTEM"
                | "MANUAL",
            )
          }
          className="rounded border border-[var(--line)] p-2 text-sm"
        >
          <option value="ALL">All</option>
          <option value="BANNED">Banned</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="PERMANENT">Permanent</option>
          <option value="SYSTEM">System policy</option>
          <option value="MANUAL">Manual admin</option>
        </select>
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          className="rounded border border-[var(--line)] p-2 text-sm"
          placeholder="Search user/admin/source"
        />
        <button
          type="button"
          onClick={() =>
            void unbanTarget({
              userId: userId || undefined,
              email: email || undefined,
            })
          }
          className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white"
        >
          Unban typed user
        </button>
      </div>

      {message && <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>}

      <div className="mt-4 space-y-2">
        {filteredBans.map((ban) => (
          <article
            key={ban.id}
            className="flex items-center justify-between rounded border border-[var(--line)] p-3 text-sm"
          >
            <div>
              <p className="font-semibold">
                {ban.nickname} ({ban.email}) • {ban.role}
              </p>
              <p className="text-[var(--text-soft)]">
                Banned until: {ban.isPermanent ? "Forever" : ban.bannedAt ? new Date(ban.bannedAt).toLocaleString() : "not banned"} •{" "}
                {(ban.status ?? (ban.active ? "BANNED" : "CANCELLED")).toLowerCase()} • By:{" "}
                {ban.banMeta?.bannedBy?.nickname ?? "Unknown"}
              </p>
              {ban.banMeta?.source && (
                <p className="text-[var(--text-soft)]">Source: {ban.banMeta.source}</p>
              )}
              {ban.banMeta?.reason && (
                <p className="text-[var(--text-soft)]">Reason: {ban.banMeta.reason}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void makeForever({ userId: ban.id })}
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Make forever
              </button>
              <button
                type="button"
                onClick={() => void unbanTarget({ userId: ban.id })}
                className="rounded bg-[var(--cta-green)] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Unban
              </button>
            </div>
          </article>
        ))}
        {!filteredBans.length && (
          <p className="text-sm text-[var(--text-soft)]">No bans match current filter.</p>
        )}
      </div>
    </section>
  );
}
