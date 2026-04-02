"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  streamId: string;
  streamType: "SCHOOL" | "GUEST";
  isLockedSchoolStream: boolean;
  subscriptionHref?: string;
  manualTrialToken?: string | null;
};

type AccessMeResponse = {
  access:
    | {
        tier: "none" | "trial" | "subscription";
        canWatchSchoolStream: boolean;
      }
    | null;
  activeSubscription: unknown | null;
  activeGrant: { lessonsRemaining?: number } | null;
  manualTrial?: { id?: string } | null;
  trial?: {
    trialAttendedCount?: number;
    trialRemaining?: number;
    activeForStream?: boolean;
    trialEndsAt?: string | null;
  } | null;
};

export function TrialOrSubscribePanel({
  streamId,
  streamType,
  isLockedSchoolStream,
  subscriptionHref,
  manualTrialToken,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [locked, setLocked] = useState(isLockedSchoolStream);

  useEffect(() => {
    if (streamType !== "SCHOOL") return;
    let ignore = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function checkScopeAccess() {
      try {
        const params = new URLSearchParams({
          streamId,
        });
        if (manualTrialToken) {
          params.set("manualTrialToken", manualTrialToken);
        }
        const res = await fetch(`/api/access/me?${params.toString()}`);
        const data = (await res.json()) as AccessMeResponse;
        if (ignore) return;
        setLocked(!(data.access?.canWatchSchoolStream ?? false));
      } catch {
        if (ignore) return;
        setLocked(true);
      }
    }
    void checkScopeAccess();
    timer = setInterval(() => {
      void checkScopeAccess();
    }, 30_000);
    return () => {
      ignore = true;
      if (timer) clearInterval(timer);
    };
  }, [manualTrialToken, streamId, streamType]);

  async function tryLesson() {
    setLoading(true);
    setMessage(null);
    try {
      const meParams = new URLSearchParams({ streamId });
      if (manualTrialToken) {
        meParams.set("manualTrialToken", manualTrialToken);
      }
      const meRes = await fetch(`/api/access/me?${meParams.toString()}`);
      const me = (await meRes.json()) as AccessMeResponse;

      if (me.activeSubscription) {
        setMessage("You already have subscription access. Joining stream.");
        setLocked(false);
        return;
      }

      if (me.manualTrial) {
        setMessage("Joined via manual trial assignment.");
        setLocked(false);
        return;
      }

      if (me.activeGrant && (me.activeGrant.lessonsRemaining ?? 0) > 0) {
        const grantRes = await fetch("/api/access/consume-grant-lesson", {
          method: "POST",
        });
        if (grantRes.ok) {
          const grantData = (await grantRes.json()) as { lessonsRemaining?: number };
          setMessage(
            `Joined via grant. Lessons remaining: ${grantData.lessonsRemaining ?? 0}`,
          );
          setLocked(false);
          return;
        }
      }

      const trialRes = await fetch("/api/access/try-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId, streamType }),
      });
      const trialData = (await trialRes.json()) as {
        error?: string;
        trialRemaining?: number;
        alreadyCounted?: boolean;
        trialEndsAt?: string;
        activeWindow?: boolean;
      };

      if (!trialRes.ok) {
        setMessage(
          trialData.error ?? "Trial unavailable. Please subscribe to continue.",
        );
        return;
      }

      if (trialData.alreadyCounted) {
        if (!trialData.activeWindow) {
          setMessage(
            `This stream trial has expired. Remaining trial streams: ${trialData.trialRemaining ?? 0}.`,
          );
          setLocked(true);
          return;
        }
        setMessage(
          `This stream trial is already active. Ends at ${
            trialData.trialEndsAt
              ? new Date(trialData.trialEndsAt).toLocaleTimeString()
              : "soon"
          }. Remaining trial streams: ${trialData.trialRemaining ?? 0}`,
        );
      } else {
        setMessage(
          `Joined via 20-minute trial. Ends at ${
            trialData.trialEndsAt
              ? new Date(trialData.trialEndsAt).toLocaleTimeString()
              : "soon"
          }. Remaining trial streams: ${trialData.trialRemaining ?? 0}`,
        );
      }
      setLocked(false);
    } catch {
      setMessage("Unexpected network error.");
    } finally {
      setLoading(false);
    }
  }

  if (streamType === "GUEST") {
    return (
      <p className="text-xs text-[var(--text-soft)]">
        Guest stream is open. Login required for chat and gifts.
      </p>
    );
  }

  if (!locked) {
    return (
      <p className="text-xs text-[var(--text-soft)]">
        You are authorized for this school stream.
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-[var(--line)] bg-slate-50 p-3">
      <p className="text-sm font-semibold">School stream locked</p>
      <p className="mt-1 text-xs text-[var(--text-soft)]">
        Choose trial or subscribe.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          disabled={loading}
          onClick={tryLesson}
          className="rounded bg-[var(--cta-blue)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Checking..." : "Try free lesson"}
        </button>
        <button
          onClick={() => router.push(subscriptionHref ?? "/subscriptions")}
          className="rounded bg-[var(--cta-green)] px-3 py-2 text-xs font-semibold text-white"
        >
          Subscribe now
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-[var(--text-soft)]">{message}</p>}
    </div>
  );
}
