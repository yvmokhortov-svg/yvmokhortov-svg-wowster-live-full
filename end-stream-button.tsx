"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  streamId: string;
};

export function EndStreamButton({ streamId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function endStream() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/streams/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Failed to end stream.");
        return;
      }
      setMessage("Stream ended.");
      window.dispatchEvent(new CustomEvent("chat-stream-closed"));
      window.dispatchEvent(new CustomEvent("chat-stream-state", { detail: { live: false } }));
      router.refresh();
    } catch {
      setMessage("Failed to end stream.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={endStream}
        disabled={loading}
        className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading ? "Ending..." : "End stream"}
      </button>
      {message && <p className="text-xs text-[var(--text-soft)]">{message}</p>}
    </div>
  );
}
