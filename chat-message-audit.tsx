"use client";

import { useEffect, useState } from "react";

type ChatMessageRow = {
  id: string;
  message: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    nickname: string;
    role: string;
  };
  stream: {
    id: string;
    type: string;
    roomName: string;
    status: string;
  };
};

type ResponsePayload = {
  messages?: ChatMessageRow[];
  error?: string;
};

export function ChatMessageAudit() {
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMessages() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/chat-messages?limit=100");
      const data = (await res.json()) as ResponsePayload;
      if (!res.ok) {
        setError(data.error ?? "Failed to load chat audit.");
        return;
      }
      setMessages(data.messages ?? []);
    } catch {
      setError("Failed to load chat audit.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, []);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Chat message audit</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            All written chat content is logged for admin review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMessages()}
          className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="mt-2 text-sm text-[var(--text-soft)]">Loading...</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <div className="mt-3 space-y-2">
        {!loading && !messages.length && (
          <p className="text-sm text-[var(--text-soft)]">No chat messages found.</p>
        )}
        {messages.map((msg) => (
          <article key={msg.id} className="rounded border border-[var(--line)] p-3 text-sm">
            <p className="font-semibold">
              {msg.user.nickname} ({msg.user.role}) • {msg.user.email}
            </p>
            <p className="text-xs text-[var(--text-soft)]">
              Stream: {msg.stream.type} / {msg.stream.roomName} ({msg.stream.status}) •{" "}
              {new Date(msg.createdAt).toLocaleString()}
            </p>
            <div
              className="mt-2 rounded bg-slate-50 p-2 text-sm"
              dangerouslySetInnerHTML={{ __html: msg.message }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
