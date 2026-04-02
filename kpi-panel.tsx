"use client";

import { useEffect, useState } from "react";

type RangeKey = "7d" | "30d" | "month" | "all";

type KpisPayload = {
  range: RangeKey;
  kpis: {
    subscribers: number;
    tipsCents: number;
    streamHours: number;
    classes: number;
    views: number;
    countriesIp: number;
    allSchedules: number;
  };
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function KpiPanel() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpisPayload["kpis"] | null>(null);

  async function loadKpis() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/kpis?range=${encodeURIComponent(range)}`);
      const data = (await res.json()) as KpisPayload & { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Failed to load KPIs.");
        setKpis(null);
        return;
      }
      setKpis(data.kpis);
      setLoadedOnce(true);
    } catch {
      setMessage("Failed to load KPIs.");
      setKpis(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Live KPIs</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Real counted metrics from database.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as RangeKey)}
            className="rounded border border-[var(--line)] p-2 text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
            <option value="all">All time</option>
          </select>
          <button
            type="button"
            onClick={() => void loadKpis()}
            className="rounded bg-[var(--cta-blue)] px-3 py-2 text-sm font-semibold text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="mt-2 text-sm text-[var(--text-soft)]">Loading...</p>}
      {message && <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>}

      {kpis ? (
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded border border-[var(--line)] px-3 py-2">
            <p className="text-[var(--text-soft)]">Subscribers</p>
            <p className="text-lg font-semibold">{kpis.subscribers}</p>
          </div>
          <div className="rounded border border-[var(--line)] px-3 py-2">
            <p className="text-[var(--text-soft)]">Tips</p>
            <p className="text-lg font-semibold">{formatMoney(kpis.tipsCents)}</p>
          </div>
          <div className="rounded border border-[var(--line)] px-3 py-2">
            <p className="text-[var(--text-soft)]">Hours</p>
            <p className="text-lg font-semibold">{kpis.streamHours}</p>
          </div>
          <div className="rounded border border-[var(--line)] px-3 py-2">
            <p className="text-[var(--text-soft)]">Classes</p>
            <p className="text-lg font-semibold">{kpis.classes}</p>
          </div>
          <div className="rounded border border-[var(--line)] px-3 py-2">
            <p className="text-[var(--text-soft)]">Views</p>
            <p className="text-lg font-semibold">{kpis.views}</p>
          </div>
          <div className="rounded border border-[var(--line)] px-3 py-2">
            <p className="text-[var(--text-soft)]">Countries IP</p>
            <p className="text-lg font-semibold">{kpis.countriesIp}</p>
          </div>
          <div className="rounded border border-[var(--line)] px-3 py-2">
            <p className="text-[var(--text-soft)]">All schedules</p>
            <p className="text-lg font-semibold">{kpis.allSchedules}</p>
          </div>
        </div>
      ) : !loading && loadedOnce && !message ? (
        <p className="mt-2 text-sm text-[var(--text-soft)]">No KPI data in this range yet.</p>
      ) : null}
    </section>
  );
}
