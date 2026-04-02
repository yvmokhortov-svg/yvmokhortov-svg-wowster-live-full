"use client";

import { useState } from "react";

type CreateSessionResponse = {
  checkout_url?: string;
  return_url?: string | null;
  error?: string;
  detail?: string;
};

export function SupportSchoolButton() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("10");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function continueToCheckout() {
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setMessage("Enter a valid amount.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const returnUrl = window.location.href;
      const res = await fetch("/api/payments/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "donation",
          donation_amount_cents: Math.round(amountNumber * 100),
          return_url: returnUrl,
        }),
      });
      const data = (await res.json()) as CreateSessionResponse;
      if (res.status === 401) {
        setMessage("Login required before checkout.");
        return;
      }
      if (!res.ok || !data.checkout_url) {
        setMessage(data.error ?? data.detail ?? "Checkout unavailable.");
        return;
      }
      if (data.return_url && data.checkout_url.startsWith(data.return_url)) {
        window.location.href = data.return_url;
        return;
      }
      window.location.href = data.checkout_url;
    } catch {
      setMessage("Checkout failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-[var(--cta-green)] px-4 py-2 text-xs font-semibold text-white shadow-lg"
      >
        Support the school
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded bg-white p-4">
            <p className="text-sm font-semibold">Support the school</p>
            <p className="mt-1 text-xs text-[var(--text-soft)]">
              Separate support checkout. This is not the live-chat TIP button.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span>$</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-28 rounded border border-[var(--line)] px-2 py-1 text-sm"
              />
            </div>
            {message && <p className="mt-2 text-xs text-red-700">{message}</p>}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-[var(--line)] px-3 py-1.5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={continueToCheckout}
                className="rounded bg-[var(--cta-green)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Opening checkout..." : "Continue to 2Checkout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
