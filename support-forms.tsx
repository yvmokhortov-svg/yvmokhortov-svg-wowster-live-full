"use client";

import { FormEvent, useState } from "react";

type TicketResponse = {
  ok?: boolean;
  error?: string;
  ticket?: { id: string };
};

export function SupportForms() {
  const [question, setQuestion] = useState("");
  const [questionEmail, setQuestionEmail] = useState("");
  const [customStudents, setCustomStudents] = useState("10");
  const [customCountry, setCustomCountry] = useState("");
  const [customPreferred, setCustomPreferred] = useState("");
  const [customAgeRange, setCustomAgeRange] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [questionMessage, setQuestionMessage] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [customLoading, setCustomLoading] = useState(false);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuestionMessage(null);
    setQuestionLoading(true);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "question",
          message: question,
          contactEmail: questionEmail || undefined,
        }),
      });
      const data = (await res.json()) as TicketResponse;
      if (!res.ok) {
        setQuestionMessage(data.error ?? "Failed to submit ticket.");
        return;
      }
      setQuestion("");
      setQuestionMessage(`Submitted. Ticket ID: ${data.ticket?.id ?? "created"}`);
    } catch {
      setQuestionMessage("Unexpected network error.");
    } finally {
      setQuestionLoading(false);
    }
  }

  async function submitCustomOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCustomMessage(null);
    setCustomLoading(true);
    try {
      const numberOfStudents = Number(customStudents);
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "custom_class_order",
          numberOfStudents,
          country: customCountry,
          preferredDaysTimes: customPreferred,
          ageRange: customAgeRange,
          note: customNote || undefined,
          contactEmail: customEmail || undefined,
        }),
      });
      const data = (await res.json()) as TicketResponse;
      if (!res.ok) {
        setCustomMessage(data.error ?? "Failed to submit custom order.");
        return;
      }
      setCustomMessage(`Submitted. Ticket ID: ${data.ticket?.id ?? "created"}`);
      setCustomStudents("10");
      setCustomCountry("");
      setCustomPreferred("");
      setCustomAgeRange("");
      setCustomNote("");
    } catch {
      setCustomMessage("Unexpected network error.");
    } finally {
      setCustomLoading(false);
    }
  }

  return (
    <>
      <section className="rounded-xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-xl font-semibold">Ask a question</h2>
        <form onSubmit={submitQuestion} className="mt-3 space-y-3">
          <textarea
            className="w-full rounded-lg border border-[var(--line)] p-3 text-sm"
            rows={4}
            placeholder="Write your question..."
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            required
          />
          <input
            className="w-full rounded-lg border border-[var(--line)] p-2.5 text-sm"
            placeholder="Contact email (optional)"
            type="email"
            value={questionEmail}
            onChange={(event) => setQuestionEmail(event.target.value)}
          />
          <button
            disabled={questionLoading}
            className="rounded-lg bg-[var(--cta-green)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {questionLoading ? "Submitting..." : "Submit"}
          </button>
          {questionMessage && (
            <p className="text-sm text-[var(--text-soft)]">{questionMessage}</p>
          )}
        </form>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-xl font-semibold">Custom class order (10+ seats)</h2>
        <form onSubmit={submitCustomOrder} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="rounded-lg border border-[var(--line)] p-2.5 text-sm"
              placeholder="Number of students"
              type="number"
              min={10}
              value={customStudents}
              onChange={(event) => setCustomStudents(event.target.value)}
              required
            />
            <input
              className="rounded-lg border border-[var(--line)] p-2.5 text-sm"
              placeholder="Country"
              value={customCountry}
              onChange={(event) => setCustomCountry(event.target.value)}
              required
            />
            <input
              className="rounded-lg border border-[var(--line)] p-2.5 text-sm"
              placeholder="Preferred days/times"
              value={customPreferred}
              onChange={(event) => setCustomPreferred(event.target.value)}
              required
            />
            <input
              className="rounded-lg border border-[var(--line)] p-2.5 text-sm"
              placeholder="Age range"
              value={customAgeRange}
              onChange={(event) => setCustomAgeRange(event.target.value)}
              required
            />
            <input
              className="rounded-lg border border-[var(--line)] p-2.5 text-sm sm:col-span-2"
              placeholder="Contact email (optional)"
              type="email"
              value={customEmail}
              onChange={(event) => setCustomEmail(event.target.value)}
            />
            <textarea
              className="rounded-lg border border-[var(--line)] p-2.5 text-sm sm:col-span-2"
              rows={3}
              placeholder="Additional note (optional)"
              value={customNote}
              onChange={(event) => setCustomNote(event.target.value)}
            />
          </div>
          <button
            disabled={customLoading}
            className="rounded-lg bg-[var(--cta-blue)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {customLoading ? "Submitting..." : "Create support ticket"}
          </button>
          {customMessage && (
            <p className="text-sm text-[var(--text-soft)]">{customMessage}</p>
          )}
        </form>
      </section>
    </>
  );
}
