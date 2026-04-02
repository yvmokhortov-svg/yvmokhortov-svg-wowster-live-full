"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  streamId: string;
  message: string;
  createdAt: string;
  user: {
    id: string;
    nickname: string;
    role: string;
  };
};

type ChatPermissions = {
  canRead: boolean;
  canSendText: boolean;
  canSendEconomy: boolean;
  phase: "LESSON" | "QNA";
  reason: string | null;
};

type PolicyModerationPayload = {
  code?: string;
  strikeCount?: number;
  warningNumber?: number;
  banned?: boolean;
  bannedUntil?: string | null;
};

type CatalogItem = {
  id: string;
  name: string;
  imageUrl: string;
  priceCents: number;
  active: boolean;
};

type WalletState = {
  freeStickersRemaining: number;
  stickerBundleRemaining: number;
  giftBundleRemaining: number;
};

type BundlePricing = {
  type: "STICKERS" | "GIFTS";
  bundlePriceCents: number;
  totalItems: number;
  active: boolean;
};

type PendingCheckout = {
  streamId: string;
  kind: "sticker" | "gift" | "tip" | "bundle_stickers" | "bundle_gifts";
  itemId?: string;
  amountCents?: number;
  providerTxId: string;
  createdAt: number;
  manualTrialToken?: string | null;
};

type Props = {
  streamId: string;
  manualTrialToken?: string | null;
};

export function LiveChatPanel({ streamId, manualTrialToken }: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inlineWarning, setInlineWarning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<ChatPermissions | null>(null);
  const [wallet, setWallet] = useState<WalletState>({
    freeStickersRemaining: 0,
    stickerBundleRemaining: 0,
    giftBundleRemaining: 0,
  });
  const [catalog, setCatalog] = useState<{ stickers: CatalogItem[]; gifts: CatalogItem[] }>({
    stickers: [],
    gifts: [],
  });
  const [bundlePricing, setBundlePricing] = useState<{
    stickers: BundlePricing;
    gifts: BundlePricing;
  }>({
    stickers: {
      type: "STICKERS",
      bundlePriceCents: 3999,
      totalItems: 6,
      active: true,
    },
    gifts: {
      type: "GIFTS",
      bundlePriceCents: 8000,
      totalItems: 8,
      active: true,
    },
  });
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [isStreamLive, setIsStreamLive] = useState(true);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [activePopover, setActivePopover] = useState<"stickers" | "gifts" | "tip" | null>(null);
  const [tipAmount, setTipAmount] = useState("10");
  const [pausedAutoscroll, setPausedAutoscroll] = useState(false);
  const [processingCheckoutCallback, setProcessingCheckoutCallback] = useState(false);

  const pendingCheckoutStorageKey = `chat_pending_checkout_${streamId}`;
  const canSendEconomy = !!permissions?.canSendEconomy && isStreamLive;
  const canSendText = !!permissions?.canSendText && isStreamLive;

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        streamId,
        limit: "50",
      });
      if (manualTrialToken) {
        params.set("manualTrialToken", manualTrialToken);
      }
      const res = await fetch(`/api/chat/messages?${params.toString()}`);
      const data = (await res.json()) as {
        messages?: ChatMessage[];
        permissions?: ChatPermissions;
        stream?: { status?: string; startedAt?: string | null };
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to load chat.");
        return;
      }
      setMessages(data.messages ?? []);
      setPermissions(data.permissions ?? null);
      setIsStreamLive((data.stream?.status ?? "LIVE") === "LIVE");
      setStartedAt(data.stream?.startedAt ?? null);
      setError(null);
    } catch {
      setError("Failed to load chat.");
    } finally {
      setLoading(false);
    }
  }, [manualTrialToken, streamId]);

  const loadEconomyState = useCallback(async () => {
    try {
      const params = new URLSearchParams({ streamId });
      if (manualTrialToken) {
        params.set("manualTrialToken", manualTrialToken);
      }
      const res = await fetch(`/api/chat/economy?${params.toString()}`);
      const data = (await res.json()) as {
        permissions?: ChatPermissions;
        paymentsEnabled?: boolean;
        wallet?: WalletState;
        catalog?: { stickers: CatalogItem[]; gifts: CatalogItem[] };
        bundlePricing?: { stickers?: BundlePricing; gifts?: BundlePricing };
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to load chat economy.");
        return;
      }
      setPermissions(data.permissions ?? null);
      setPaymentsEnabled(!!data.paymentsEnabled);
      setWallet(
        data.wallet ?? {
          freeStickersRemaining: 0,
          stickerBundleRemaining: 0,
          giftBundleRemaining: 0,
        },
      );
      setCatalog(data.catalog ?? { stickers: [], gifts: [] });
      setBundlePricing((prev) => ({
        stickers: data.bundlePricing?.stickers ?? prev.stickers,
        gifts: data.bundlePricing?.gifts ?? prev.gifts,
      }));
    } catch {
      setError("Failed to load chat economy.");
    }
  }, [manualTrialToken, streamId]);

  useEffect(() => {
    let ignore = false;

    async function runInitialLoad() {
      if (ignore) return;
      await loadMessages();
      await loadEconomyState();
    }

    void runInitialLoad();
    const timer = setInterval(() => {
      void loadMessages();
      void loadEconomyState();
    }, 8000);

    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [loadEconomyState, loadMessages]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isStreamLive) {
      setActivePopover(null);
    }
  }, [isStreamLive]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("chat-stream-state", {
        detail: { live: isStreamLive },
      }),
    );
  }, [isStreamLive]);

  useEffect(() => {
    function onOpenPopover(event: Event) {
      const customEvent = event as CustomEvent<{ type?: "stickers" | "gifts" | "tip" }>;
      const type = customEvent.detail?.type;
      if (!type) return;
      setActivePopover(type);
    }
    function onStreamClosed() {
      setIsStreamLive(false);
      setActivePopover(null);
      setToast("Stream ended. Chat and actions are now locked.");
    }
    function onStreamState(event: Event) {
      const customEvent = event as CustomEvent<{ live?: boolean }>;
      if (typeof customEvent.detail?.live !== "boolean") return;
      setIsStreamLive(customEvent.detail.live);
      if (!customEvent.detail.live) {
        setActivePopover(null);
      }
    }
    window.addEventListener("chat-open-popover", onOpenPopover);
    window.addEventListener("chat-stream-closed", onStreamClosed);
    window.addEventListener("chat-stream-state", onStreamState);
    return () => {
      window.removeEventListener("chat-open-popover", onOpenPopover);
      window.removeEventListener("chat-stream-closed", onStreamClosed);
      window.removeEventListener("chat-stream-state", onStreamState);
    };
  }, []);

  useEffect(() => {
    if (pausedAutoscroll) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pausedAutoscroll]);

  function onListScroll() {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 20;
    setPausedAutoscroll(!nearBottom);
  }

  function formatElapsed(startIso: string | null) {
    if (!startIso) return "00:00";
    const diffMs = Math.max(Date.now() - new Date(startIso).getTime(), 0);
    const total = Math.floor(diffMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  async function runCheckout(payload: Record<string, unknown>) {
    const res = await fetch("/api/payments/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      checkout_url?: string;
      return_url?: string | null;
      error?: string;
      detail?: string;
    };
    if (!res.ok || !data.checkout_url) {
      setError(data.error ?? data.detail ?? "Checkout unavailable right now.");
      return;
    }

    // In mock checkout mode, immediately bounce to return_url.
    if (data.checkout_url.includes("mock=1") && data.return_url) {
      window.location.href = data.return_url;
      return;
    }
    // Keep compatibility with provider fallback URL marker.
    if (data.checkout_url.includes("fallback=1") && data.return_url) {
      window.location.href = data.return_url;
      return;
    }
    window.location.href = data.checkout_url;
  }

  async function sendEconomyAction(payload: {
    action: "send_sticker" | "send_gift" | "send_tip" | "buy_bundle_stickers" | "buy_bundle_gifts";
    itemId?: string;
    amountCents?: number;
  }) {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/economy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId,
          ...payload,
          manualTrialToken: manualTrialToken ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        mode?: string;
        message?: ChatMessage;
        error?: string;
        requiresCheckout?: boolean;
        checkoutPayload?: Record<string, unknown>;
      };
      if (!res.ok) {
        setError(data.error ?? "Action failed.");
        return;
      }

      if (data.requiresCheckout && data.checkoutPayload) {
        if (!paymentsEnabled) {
          setError("Payments are disabled right now, so this purchase cannot complete yet.");
          return;
        }
        const checkoutPayload = data.checkoutPayload as Record<string, unknown>;
        const providerTxId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const pending: PendingCheckout | null = (() => {
          if (checkoutPayload.type === "sticker" && typeof checkoutPayload.item_id === "string") {
            return {
              streamId,
              kind: "sticker",
              itemId: checkoutPayload.item_id,
              providerTxId,
              createdAt: Date.now(),
              manualTrialToken,
            };
          }
          if (checkoutPayload.type === "gift" && typeof checkoutPayload.item_id === "string") {
            return {
              streamId,
              kind: "gift",
              itemId: checkoutPayload.item_id,
              providerTxId,
              createdAt: Date.now(),
              manualTrialToken,
            };
          }
          if (
            checkoutPayload.type === "donation" &&
            typeof checkoutPayload.donation_amount_cents === "number"
          ) {
            return {
              streamId,
              kind: "tip",
              amountCents: checkoutPayload.donation_amount_cents,
              providerTxId,
              createdAt: Date.now(),
              manualTrialToken,
            };
          }
          if (
            checkoutPayload.type === "bundle" &&
            checkoutPayload.bundle_type === "stickers"
          ) {
            return {
              streamId,
              kind: "bundle_stickers",
              providerTxId,
              createdAt: Date.now(),
              manualTrialToken,
            };
          }
          if (
            checkoutPayload.type === "bundle" &&
            checkoutPayload.bundle_type === "gifts"
          ) {
            return {
              streamId,
              kind: "bundle_gifts",
              providerTxId,
              createdAt: Date.now(),
              manualTrialToken,
            };
          }
          return null;
        })();

        if (!pending) {
          setError("Unsupported checkout payload.");
          return;
        }

        sessionStorage.setItem(pendingCheckoutStorageKey, JSON.stringify(pending));

        const callbackUrl = new URL(window.location.href);
        callbackUrl.searchParams.set("checkout_status", "succeeded");
        callbackUrl.searchParams.set("checkout_stream_id", streamId);
        callbackUrl.searchParams.set("checkout_tx", providerTxId);
        if (manualTrialToken) {
          callbackUrl.searchParams.set("manualTrialToken", manualTrialToken);
        }

        await runCheckout({
          ...checkoutPayload,
          return_url: callbackUrl.toString(),
        });
        return;
      }

      if (data.message) {
        setMessages((prev) => [...prev, data.message!].slice(-50));
      }
      setActivePopover(null);
      await loadEconomyState();
    } catch {
      setError("Action failed.");
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    if (processingCheckoutCallback) return;
    const url = new URL(window.location.href);
    const status = url.searchParams.get("checkout_status");
    const callbackStreamId = url.searchParams.get("checkout_stream_id");
    if (!status || callbackStreamId !== streamId) return;

    const raw = sessionStorage.getItem(pendingCheckoutStorageKey);
    if (!raw) {
      url.searchParams.delete("checkout_status");
      url.searchParams.delete("checkout_stream_id");
      url.searchParams.delete("checkout_tx");
      window.history.replaceState({}, "", url.toString());
      return;
    }

    const txFromQuery = url.searchParams.get("checkout_tx");
    let pending: PendingCheckout;
    try {
      pending = JSON.parse(raw) as PendingCheckout;
    } catch {
      sessionStorage.removeItem(pendingCheckoutStorageKey);
      return;
    }

    if (status !== "succeeded") {
      sessionStorage.removeItem(pendingCheckoutStorageKey);
      setError("Checkout did not succeed.");
      return;
    }

    async function confirmCheckout() {
      setProcessingCheckoutCallback(true);
      try {
        const res = await fetch("/api/chat/economy/checkout-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            streamId: pending.streamId,
            kind: pending.kind,
            itemId: pending.itemId,
            amountCents: pending.amountCents,
            providerTxId: txFromQuery ?? pending.providerTxId,
            manualTrialToken:
              pending.manualTrialToken ?? manualTrialToken ?? undefined,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          message?: ChatMessage | null;
          wallet?: WalletState;
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "Checkout callback sync failed.");
          return;
        }

        if (data.message) {
          setMessages((prev) => [...prev, data.message!].slice(-50));
        }
        if (data.wallet) {
          setWallet(data.wallet);
        }
        await loadMessages();
        await loadEconomyState();
        setToast("Payment synced.");
      } catch {
        setError("Checkout callback sync failed.");
      } finally {
        sessionStorage.removeItem(pendingCheckoutStorageKey);
        url.searchParams.delete("checkout_status");
        url.searchParams.delete("checkout_stream_id");
        url.searchParams.delete("checkout_tx");
        window.history.replaceState({}, "", url.toString());
        setProcessingCheckoutCallback(false);
      }
    }

    void confirmCheckout();
  }, [
    loadEconomyState,
    loadMessages,
    manualTrialToken,
    pendingCheckoutStorageKey,
    processingCheckoutCallback,
    streamId,
  ]);

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;

    setSending(true);
    setError(null);
    setInlineWarning(null);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId,
          message: value,
          manualTrialToken: manualTrialToken ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        message?: ChatMessage;
        moderation?: PolicyModerationPayload;
        error?: string;
      };
      if (!res.ok) {
        if (data.moderation?.code === "POLICY_BLOCK") {
          const secondWarning =
            !data.moderation.banned && data.moderation.warningNumber === 2;
          const warningText = secondWarning
            ? "Naught naighty ban caution Final."
            : "Naughty naughty ban caution";
          setText("");
          setInlineWarning(warningText);
          setToast(warningText);
          const bannedUntilLabel = data.moderation.bannedUntil
            ? ` Banned until ${new Date(data.moderation.bannedUntil).toLocaleDateString()}.`
            : "";
          setModalMessage(
            data.moderation.banned
              ? `Naughty naughty ban caution.${bannedUntilLabel}`
              : secondWarning
                ? "Naught naighty ban caution Final."
                : "Naughty naughty ban caution",
          );
        }
        setError(data.error ?? "Message could not be sent.");
        return;
      }
      if (data.message) {
        setMessages((prev) => [...prev, data.message!].slice(-50));
      }
      setText("");
    } catch {
      setError("Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function reportMessageAbuse(messageId: string) {
    const reason = window.prompt("Report reason");
    if (!reason || reason.trim().length < 3) return;
    const res = await fetch("/api/chat/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streamId,
        chatMessageId: messageId,
        reason,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Report failed.");
      return;
    }
    setToast("Report sent to support.");
  }

  const placeholder = useMemo(() => {
    if (loading && messages.length === 0) return "Loading chat...";
    if (messages.length === 0) return "No messages yet. Start the conversation.";
    return null;
  }, [loading, messages.length]);

  return (
    <div id="live-chat-panel" className="relative">
      <div className="flex items-center justify-between rounded bg-slate-100 px-2 py-1 text-xs font-semibold">
        <span>Chat</span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            {["bg-yellow-300", "bg-green-400", "bg-pink-300", "bg-blue-400", "bg-purple-500"].map(
              (dot) => (
                <span key={dot} className={`h-3 w-3 rounded-full ${dot}`} />
              ),
            )}
          </span>
          <span className="text-red-700">
            LIVE • {formatElapsed(startedAt)}
            <span className="hidden">{nowTick}</span>
          </span>
        </div>
      </div>
      <div
        ref={listRef}
        onScroll={onListScroll}
        className="mt-2 h-56 overflow-y-auto rounded bg-slate-50 p-2 text-xs"
      >
        {placeholder ? (
          <p className="text-[var(--text-soft)]">{placeholder}</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((item) => (
              <li key={item.id} className="rounded border border-[var(--line)] bg-white p-2">
                <p className="font-semibold">{item.user.nickname}</p>
                <div
                  className="mt-1"
                  // Chat rows are server-produced HTML snippets.
                  dangerouslySetInnerHTML={{ __html: item.message }}
                />
                <button
                  type="button"
                  onClick={() => void reportMessageAbuse(item.id)}
                  className="mt-1 text-[10px] font-semibold text-[var(--cta-blue)]"
                >
                  Report abuse
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pausedAutoscroll && (
        <button
          type="button"
          onClick={() => {
            setPausedAutoscroll(false);
            const el = listRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="mt-1 rounded bg-slate-200 px-2 py-1 text-[10px] font-semibold"
        >
          Resume auto-scroll
        </button>
      )}

      {permissions?.phase === "QNA" && permissions.reason && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          Q&A locked: please upgrade +$10
        </p>
      )}
      {inlineWarning && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
          {inlineWarning}
        </p>
      )}

      <form onSubmit={submitMessage} className="mt-2 space-y-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write a message..."
          maxLength={500}
          disabled={!canSendText}
          className="w-full rounded border border-[var(--line)] px-2 py-1.5 text-xs"
        />
        <button
          type="submit"
          disabled={sending || !canSendText}
          className="w-full rounded bg-[var(--cta-green)] py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {sending ? "Sending..." : "Send message"}
        </button>
      </form>

      <div className="relative mt-2 flex flex-wrap gap-2">
        <div className="grid w-full grid-cols-[1fr_1fr_1.1fr] gap-2">
          <button
            type="button"
            onClick={() => setActivePopover((v) => (v === "stickers" ? null : "stickers"))}
            disabled={!canSendEconomy || actionLoading}
            className="rounded bg-[var(--cta-blue)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
          >
            Send sticker
          </button>
          <button
            type="button"
            onClick={() => setActivePopover((v) => (v === "gifts" ? null : "gifts"))}
            disabled={!canSendEconomy || actionLoading}
            className="rounded bg-[var(--cta-blue)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
          >
            Send gift
          </button>
          <button
            type="button"
            onClick={() => setActivePopover((v) => (v === "tip" ? null : "tip"))}
            disabled={!canSendEconomy || actionLoading}
            className="rounded bg-[var(--cta-blue)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
          >
            TIP
          </button>
        </div>
        <a
          href="/support"
          className="rounded border border-[var(--line)] px-2 py-1 text-xs font-semibold"
        >
          Report abuse
        </a>
      </div>

      <p className="mt-1 text-[10px] text-[var(--text-soft)]">
        Free stickers: {wallet.freeStickersRemaining} • Sticker bundle left:{" "}
        {wallet.stickerBundleRemaining} • Gift bundle left: {wallet.giftBundleRemaining}
      </p>

      {activePopover === "stickers" && (
        <div className="mt-2 rounded border border-[var(--line)] bg-white p-2 text-xs shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Send sticker</p>
            <button
              type="button"
              disabled={!bundlePricing.stickers.active}
              onClick={() => void sendEconomyAction({ action: "buy_bundle_stickers" })}
              className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
            >
              Buy Sticker Bundle (${(bundlePricing.stickers.bundlePriceCents / 100).toFixed(2)})
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {catalog.stickers.slice(0, 7).map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!canSendEconomy || actionLoading}
                onClick={() => void sendEconomyAction({ action: "send_sticker", itemId: item.id })}
                className="min-w-[120px] rounded border border-[var(--line)] p-2 text-left disabled:opacity-60"
              >
                <p className="font-semibold">{item.name}</p>
                <p>${(item.priceCents / 100).toFixed(2)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {activePopover === "gifts" && (
        <div className="mt-2 rounded border border-[var(--line)] bg-white p-2 text-xs shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Send gift</p>
            <button
              type="button"
              disabled={!bundlePricing.gifts.active}
              onClick={() => void sendEconomyAction({ action: "buy_bundle_gifts" })}
              className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
            >
              Buy Gift Bundle (${(bundlePricing.gifts.bundlePriceCents / 100).toFixed(2)})
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {catalog.gifts.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!canSendEconomy || actionLoading}
                onClick={() => void sendEconomyAction({ action: "send_gift", itemId: item.id })}
                className="min-w-[120px] rounded border border-[var(--line)] p-2 text-left disabled:opacity-60"
              >
                <p className="font-semibold">{item.name}</p>
                <p>${(item.priceCents / 100).toFixed(2)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {activePopover === "tip" && (
        <div className="mt-2 rounded border border-[var(--line)] bg-white p-2 text-xs shadow-sm">
          <p className="font-semibold">Send TIP</p>
          <div className="mt-2 flex items-center gap-2">
            <span>$</span>
            <input
              value={tipAmount}
              onChange={(event) => setTipAmount(event.target.value)}
              className="w-20 rounded border border-[var(--line)] px-2 py-1"
            />
            <button
              type="button"
              disabled={!canSendEconomy || actionLoading}
              onClick={() =>
                void sendEconomyAction({
                  action: "send_tip",
                  amountCents: Math.round(Number(tipAmount || "0") * 100),
                })
              }
              className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-60"
            >
              TIP
            </button>
          </div>
        </div>
      )}

      {permissions?.reason && (
        <p className="mt-2 text-xs text-[var(--text-soft)]">{permissions.reason}</p>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {toast && (
        <div className="fixed right-4 top-4 z-40 rounded bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
          {toast}
        </div>
      )}
      {modalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded bg-white p-4">
            <p className="text-sm font-semibold text-red-700">{modalMessage}</p>
            <button
              type="button"
              onClick={() => setModalMessage(null)}
              className="mt-3 rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
