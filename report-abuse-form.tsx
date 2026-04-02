"use client";

import { FormEvent, useState } from "react";

type TargetType =
  | "chat_message"
  | "profile"
  | "graduation_work"
  | "upload"
  | "stream"
  | "other";

type Props = {
  defaultTargetType?: TargetType;
  defaultTargetId?: string;
  title?: string;
  compact?: boolean;
};

type ResponsePayload = {
  ok?: boolean;
  error?: string;
  report?: { id?: string };
};

const targetOptions: Array<{ value: TargetType; label: string }> = [
  { value: "chat_message", label: "Chat message" },
  { value: "profile", label: "Profile" },
  { value: "graduation_work", label: "Graduation work" },
  { value: "upload", label: "Upload" },
  { value: "stream", label: "Stream" },
  { value: "other", label: "Other" },
];

export function ReportAbuseForm({
  defaultTargetType = "other",
  defaultTargetId = "",
  title = "Report abuse",
  compact = false,
}: Props) {
  const [targetType, setTargetType] = useState<TargetType>(defaultTargetType);
  const [targetId, setTargetId] = useState(defaultTargetId);
  const [reason, setReason] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/moderation/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId: targetId || undefined,
          reason,
          context: context || undefined,
        }),
      });

      const data = (await res.json()) as ResponsePayload;
      if (!res.ok) {
        setMessage(data.error ?? "Failed to submit report.");
        return;
      }

      setReason("");
      setContext("");
      setMessage(`Report submitted. ID: ${data.report?.id ?? "created"}`);
    } catch {
      setMessage("Unexpected network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <form onSubmit={onSubmit} className="mt-2 space-y-2">
        {!compact && (
          <select
            value={targetType}
            onChange={(event) => setTargetType(event.target.value as TargetType)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
          >
            {targetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        {!compact && (
          <input
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            className="w-full rounded border border-[var(--line)] p-2 text-sm"
            placeholder="Target ID (optional)"
          />
        )}
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="w-full rounded border border-[var(--line)] p-2 text-sm"
          placeholder="Reason"
          rows={2}
          required
        />
        <textarea
          value={context}
          onChange={(event) => setContext(event.target.value)}
          className="w-full rounded border border-[var(--line)] p-2 text-sm"
          placeholder="Context (optional)"
          rows={compact ? 2 : 3}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-zinc-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Sending..." : "Submit report"}
        </button>
        {message && <p className="text-xs text-[var(--text-soft)]">{message}</p>}
      </form>
    </section>
  );
}
