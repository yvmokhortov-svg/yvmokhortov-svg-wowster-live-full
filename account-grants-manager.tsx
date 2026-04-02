"use client";

import { FormEvent, useState } from "react";

type GrantRow = {
  id: string;
  userId: string;
  lessonLimit: number;
  lessonsUsed: number;
  lessonsRemaining?: number;
  active: boolean;
  reason: string | null;
  user?: { id: string; email: string; nickname: string };
};

export function AccountGrantsManager() {
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [lessonCount, setLessonCount] = useState(4);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [grants, setGrants] = useState<GrantRow[]>([]);

  async function loadGrants() {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (email) params.set("email", email);
    const res = await fetch(`/api/admin/account-grants?${params.toString()}`);
    const data = (await res.json()) as { grants?: GrantRow[]; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to load grants");
      return;
    }
    setGrants(data.grants ?? []);
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const res = await fetch("/api/admin/account-grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId || undefined,
        email: email || undefined,
        lessonCount,
        reason: reason || undefined,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to create grant");
      return;
    }
    setMessage("Grant created");
    await loadGrants();
  }

  async function toggleGrant(id: string, active: boolean) {
    const res = await fetch(`/api/admin/account-grants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Failed to update grant");
      return;
    }
    setMessage(!active ? "Grant activated" : "Grant deactivated");
    await loadGrants();
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <h2 className="text-xl font-semibold">Account grants (off by default)</h2>
      <p className="mt-1 text-sm text-[var(--text-soft)]">
        Target a specific account by user ID or email.
      </p>

      <form onSubmit={onCreate} className="mt-3 grid gap-2 md:grid-cols-2">
        <input
          className="rounded border border-[var(--line)] p-2 text-sm"
          placeholder="User ID (optional)"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <input
          className="rounded border border-[var(--line)] p-2 text-sm"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="rounded border border-[var(--line)] p-2 text-sm"
          type="number"
          min={1}
          max={8}
          value={lessonCount}
          onChange={(e) => setLessonCount(Number(e.target.value))}
          required
        />
        <div className="rounded border border-[var(--line)] p-2 text-sm text-[var(--text-soft)]">
          Default 4 lessons. Use 8 for full month equivalent.
        </div>
        <input
          className="rounded border border-[var(--line)] p-2 text-sm md:col-span-2"
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button className="rounded bg-[var(--cta-green)] px-3 py-2 text-sm font-semibold text-white md:col-span-2">
          Grant free lessons
        </button>
      </form>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={loadGrants}
          className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
        >
          Refresh grants
        </button>
      </div>

      {message && <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>}

      <div className="mt-4 space-y-2">
        {grants.map((grant) => (
          <div
            key={grant.id}
            className="flex items-center justify-between rounded border border-[var(--line)] p-2 text-sm"
          >
            <div>
              <p className="font-semibold">
                {grant.user?.nickname ?? grant.userId} • {grant.user?.email ?? "no-email"}
              </p>
              <p className="text-[var(--text-soft)]">
                {grant.lessonsUsed}/{grant.lessonLimit} used •{" "}
                {grant.lessonsRemaining ?? Math.max(grant.lessonLimit - grant.lessonsUsed, 0)} remaining •{" "}
                {grant.active ? "active" : "inactive"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleGrant(grant.id, grant.active)}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white"
            >
              {grant.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
        {!grants.length && <p className="text-sm text-[var(--text-soft)]">No grants loaded.</p>}
      </div>
    </section>
  );
}
