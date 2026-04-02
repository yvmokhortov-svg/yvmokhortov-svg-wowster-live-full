"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  streamId: string;
  disabled?: boolean;
};

function openPopover(type: "stickers" | "gifts" | "tip") {
  window.dispatchEvent(
    new CustomEvent("chat-open-popover", {
      detail: { type },
    }),
  );
}

export function ChatActionDock({ streamId, disabled = false }: Props) {
  const [streamLive, setStreamLive] = useState(!disabled);

  useEffect(() => {
    function onStreamClosed() {
      setStreamLive(false);
    }
    function onStreamState(event: Event) {
      const customEvent = event as CustomEvent<{ live?: boolean }>;
      if (typeof customEvent.detail?.live === "boolean") {
        setStreamLive(customEvent.detail.live);
      }
    }
    window.addEventListener("chat-stream-closed", onStreamClosed);
    window.addEventListener("chat-stream-state", onStreamState);
    return () => {
      window.removeEventListener("chat-stream-closed", onStreamClosed);
      window.removeEventListener("chat-stream-state", onStreamState);
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    async function pollStatus() {
      try {
        const res = await fetch(
          `/api/chat/messages?streamId=${encodeURIComponent(streamId)}&limit=1`,
        );
        const data = (await res.json()) as { stream?: { status?: string } };
        if (ignore) return;
        const live = (data.stream?.status ?? "LIVE") === "LIVE";
        setStreamLive(live);
      } catch {
        if (ignore) return;
      }
    }
    void pollStatus();
    const timer = setInterval(() => {
      void pollStatus();
    }, 8000);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [streamId]);

  const actionDisabled = useMemo(() => disabled || !streamLive, [disabled, streamLive]);

  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] bg-slate-50 p-2">
      <p className="text-xs font-semibold">Chat actions under video</p>
      <div className="mt-2 grid grid-cols-[1fr_1fr_1.2fr] gap-2">
        <button
          type="button"
          disabled={actionDisabled}
          onClick={() => openPopover("stickers")}
          className="rounded bg-[var(--cta-blue)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          Send sticker
        </button>
        <button
          type="button"
          disabled={actionDisabled}
          onClick={() => openPopover("gifts")}
          className="rounded bg-[var(--cta-blue)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          Send gift
        </button>
        <button
          type="button"
          disabled={actionDisabled}
          onClick={() => openPopover("tip")}
          className="rounded bg-[var(--cta-green)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          Send TIP
        </button>
      </div>
      {!streamLive && (
        <p className="mt-2 text-[10px] text-[var(--text-soft)]">
          Stream ended. Actions are locked.
        </p>
      )}
    </div>
  );
}
