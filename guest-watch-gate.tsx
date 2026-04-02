"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Props = {
  isGuestStream: boolean;
  isAuthenticated: boolean;
};

export function GuestWatchGate({ isGuestStream, isAuthenticated }: Props) {
  const [remainingSeconds, setRemainingSeconds] = useState(180);

  useEffect(() => {
    if (!isGuestStream || isAuthenticated) return;
    const timer = setInterval(() => {
      setRemainingSeconds((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated, isGuestStream]);

  const expired = isGuestStream && !isAuthenticated && remainingSeconds <= 0;
  const showRegisterModal = expired;
  const progressPercent = Math.max(Math.min((remainingSeconds / 180) * 100, 100), 0);
  const remainingLabel = useMemo(() => {
    const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
    const ss = String(remainingSeconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [remainingSeconds]);

  return (
    <div className="relative aspect-video rounded-md bg-slate-300">
      {isGuestStream && !isAuthenticated && !expired && (
        <>
          <div className="absolute right-2 top-2 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
            Guest preview • Register in {remainingLabel}
          </div>
          <div className="absolute bottom-2 left-2 right-2 h-1.5 overflow-hidden rounded bg-black/30">
            <div
              className={`h-full ${remainingSeconds <= 60 ? "bg-red-500" : "bg-emerald-400"}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </>
      )}
      {expired && (
        <div className="absolute inset-0 rounded-md bg-black/65" />
      )}
      {showRegisterModal && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-white/20 bg-zinc-900/95 p-4 text-center shadow-2xl">
            <p className="text-sm font-semibold text-white">
              Preview ended. Register account to continue watching guest stream.
            </p>
            <p className="mt-1 text-xs text-zinc-300">Guest stream gate: 3 minutes free watch.</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Link
                href="/register-user"
                className="rounded bg-[var(--cta-green)] px-3 py-2 text-xs font-semibold text-white"
              >
                Register
              </Link>
              <Link
                href="/login"
                className="rounded bg-[var(--cta-blue)] px-3 py-2 text-xs font-semibold text-white"
              >
                Login
              </Link>
            </div>
            <div className="mt-2">
              <p className="text-[11px] text-zinc-300">
                Close this dialog by registering or logging in.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
