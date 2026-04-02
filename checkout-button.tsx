"use client";

import { useState } from "react";

type SubscribeCheckoutButtonProps = {
  tierName: string;
  tierCents: number;
  classId?: string;
  houseName?: string;
  level?: number;
  classDay?: string;
  classTime?: string;
  teacherNickname?: string;
};

type CreateSessionResponse = {
  checkout_url?: string;
  error?: string;
  detail?: string;
};

export function SubscribeCheckoutButton({
  tierName,
  tierCents,
  classId,
  houseName,
  level,
  classDay,
  classTime,
  teacherNickname,
}: SubscribeCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onCheckout() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/payments/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "subscription",
          tier_cents: tierCents,
          class_id: classId,
          house_name: houseName,
          level,
          class_day: classDay,
          class_time: classTime,
          teacher_nickname: teacherNickname,
        }),
      });
      const data = (await res.json()) as CreateSessionResponse;

      if (!res.ok) {
        setMessage(data.error ?? data.detail ?? "Unable to create checkout session.");
        return;
      }

      if (!data.checkout_url) {
        setMessage("Checkout session created without URL.");
        return;
      }

      window.location.href = data.checkout_url;
    } catch {
      setMessage("Unexpected network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <button
        disabled={loading}
        onClick={onCheckout}
        className="rounded-lg bg-[var(--cta-green)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading ? "Preparing checkout..." : `Checkout ${tierName} with 2Checkout`}
      </button>
      {message && <p className="text-xs text-[var(--text-soft)]">{message}</p>}
    </div>
  );
}
