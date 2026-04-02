"use client";

import { useState } from "react";

export function JoinSchoolStreamButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function joinWithGrantLesson() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/access/consume-grant-lesson", {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        lessonsRemaining?: number;
      };

      if (!res.ok) {
        if (res.status === 409) {
          setMessage("Grant lessons are finished. Please subscribe to continue.");
          return;
        }
        if (res.status === 404) {
          setMessage("No active lesson grant found. Use trial or subscribe.");
          return;
        }
        if (res.status === 403) {
          setMessage("Grant mode is disabled by admin.");
          return;
        }
        setMessage(data.error ?? "Could not join stream.");
        return;
      }

      setMessage(
        `Joined stream via grant. Lessons remaining: ${data.lessonsRemaining ?? 0}`,
      );
    } catch {
      setMessage("Unexpected network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={joinWithGrantLesson}
        disabled={loading}
        className="rounded-lg bg-[var(--cta-blue)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading ? "Joining..." : "Use grant lesson"}
      </button>
      {message && <p className="mt-2 text-xs text-[var(--text-soft)]">{message}</p>}
    </div>
  );
}
