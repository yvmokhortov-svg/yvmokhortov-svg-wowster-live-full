"use client";

import Link from "next/link";
import { useState } from "react";

type ClassActionsProps = {
  classId: string;
  houseName: string;
  level: number;
  classDay: string;
  classTime: string;
  teacher: string;
  lessonMinutes: number;
};

export function ClassActions({
  classId,
  houseName,
  level,
  classDay,
  classTime,
  teacher,
  lessonMinutes,
}: ClassActionsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const subscriptionHref = `/subscriptions?classId=${encodeURIComponent(
    classId,
  )}&houseName=${encodeURIComponent(houseName)}&level=${level}&classDay=${encodeURIComponent(
    classDay,
  )}&classTime=${encodeURIComponent(classTime)}&teacher=${encodeURIComponent(
    teacher,
  )}&lessonMinutes=${lessonMinutes}`;

  async function switchClass() {
    setSwitching(true);
    setMessage(null);
    try {
      const res = await fetch("/api/subscriptions/switch-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Unable to switch class");
        return;
      }
      setMessage("Class switched for this billing cycle.");
    } catch {
      setMessage("Unexpected network error.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Link
          href={subscriptionHref}
          className="inline-block rounded-lg bg-[var(--cta-green)] px-4 py-2 text-sm font-semibold text-white"
        >
          Subscribe to this class
        </Link>
        <button
          type="button"
          disabled={switching}
          onClick={switchClass}
          className="rounded-lg bg-[var(--cta-blue)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {switching ? "Switching..." : "Switch to this class"}
        </button>
      </div>
      {message && <p className="text-xs text-[var(--text-soft)]">{message}</p>}
    </div>
  );
}
