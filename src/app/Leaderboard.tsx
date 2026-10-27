"use client";

// Rep leaderboard (owner request 2026-10-18): every sales rep as a row,
// sortable by any card metric (click a header), with a team-average row in
// gold and an "Other users" row. Each column's best value among the reps is
// tinted faintly (lower is better for first call, calls per booking, and
// median response). Values are the same Metric objects as the cards.

import { useMemo, useState } from "react";
import type { Metric, MetricDef, RepPerformance, RepScore } from "@/lib/repPerformance";
import { Avatar } from "./RepCards";

const n = (v: number) => v.toLocaleString("en-US");

function fmtAvg(kind: MetricDef["kind"], v: number): string {
  switch (kind) {
    case "pct":
      return `${Math.round(v * 100)}%`;
    case "minutes": {
      const m = Math.round(v);
      const h = Math.floor(m / 60);
      return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
    }
    case "usd":
      return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    case "ratio":
      return v.toFixed(1);
    case "clock": {
      const h24 = Math.floor(v / 3600) % 24;
      const mm = Math.floor((v % 3600) / 60);
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return `${h12}:${String(mm).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
    }
    default:
      return Number.isInteger(v) ? n(v) : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
}

export default function Leaderboard({ data, rangeLabel }: { data: RepPerformance; rangeLabel: string }) {
  const [sortKey, setSortKey] = useState(data.defaultSort);
  const [dir, setDir] = useState<"best" | "worst">("best");
  const defs = data.defs;

  const sorted = useMemo(() => {
    const def = defs.find((d) => d.key === sortKey);
    const lower = Boolean(def?.lowerIsBetter);
    const rows = [...data.reps].sort((a, b) => {
      const x = a.metrics[sortKey]?.value ?? null;
      const y = b.metrics[sortKey]?.value ?? null;
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      const c = lower ? x - y : y - x;
      return dir === "best" ? c : -c;
    });
    return rows;
  }, [data, sortKey, dir, defs]);

  // best value per column among the reps
  const best = useMemo(() => {
    const out = new Map<string, number>();
    for (const d of defs) {
      const vals = data.reps.map((r) => r.metrics[d.key]?.value).filter((v): v is number => v !== null && v !== undefined);
      if (vals.length === 0) continue;
      out.set(d.key, d.lowerIsBetter ? Math.min(...vals) : Math.max(...vals));
    }
    return out;
  }, [data, defs]);

  // team average per column (mean over reps with a value)
  const avg = useMemo(() => {
    const out = new Map<string, { text: string; count: number }>();
    for (const d of defs) {
      const vals = data.reps.map((r) => r.metrics[d.key]?.value).filter((v): v is number => v !== null && v !== undefined);
      if (vals.length === 0) {
        out.set(d.key, { text: "—", count: 0 });
        continue;
      }
      out.set(d.key, { text: fmtAvg(d.kind, vals.reduce((s, v) => s + v, 0) / vals.length), count: vals.length });
    }
    return out;
  }, [data, defs]);

  const toggle = (key: string) => {
    if (key === sortKey) setDir(dir === "best" ? "worst" : "best");
    else {
      setSortKey(key);
      setDir("best");
    }
  };

  const cell = (r: RepScore, d: MetricDef, isRep: boolean) => {
    const m: Metric = r.metrics[d.key] ?? { value: null, text: "—" };
    const isBest = isRep && m.value !== null && best.get(d.key) === m.value && data.reps.filter((x) => x.metrics[d.key]?.value === m.value).length < data.reps.length;
    return (
      <td key={d.key} className={`num${isBest ? " lb-best" : ""}${sortKey === d.key ? " lb-sorted" : ""}`} title={m.title ?? (m.sub ? m.sub : undefined)}>
        {m.text}
        {m.sub ? <span className="plan-label">{m.sub}</span> : null}
      </td>
    );
  };

  return (
    <div className="stat kpi kpi-title-xl reveal lb-card" data-kpi="leaderboard">
      <div className="kpi-head">
        <div className="label">Leaderboard</div>
        <div className="kpi-sub note">Every sales rep by any metric · click a column to sort, again to reverse · best value per column tinted · {rangeLabel}</div>
      </div>
      <div className="scroll kpi-body">
        <table className="stat-breakdown rep-table leaderboard">
          <thead>
            <tr>
              <th>
                <span className="th-sort th-static">Sales rep</span>
              </th>
              {defs.map((d) => (
                <th key={d.key} className={`num${sortKey === d.key ? " sorted" : ""}`} aria-sort={sortKey === d.key ? (dir === "best" ? "descending" : "ascending") : "none"} title={`${d.source}${d.lowerIsBetter ? " · lower is better" : ""}`}>
                  <button type="button" className="th-sort" onClick={() => toggle(d.key)}>
                    {d.label}
                    <span className="th-arrow" aria-hidden="true">
                      {sortKey === d.key ? (dir === "best" ? "▼" : "▲") : ""}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.userId ?? r.name}>
                <td className="rep-name lb-name">
                  <span className="lb-rank">#{i + 1}</span>
                  <Avatar r={r} size={28} />
                  <span>{r.name}</span>
                  {r.userId ? (
                    <a className="lb-viewas" href={`/me?as=${encodeURIComponent(r.userId)}`} title="Open this rep's own dashboard exactly as they see it">
                      View as rep
                    </a>
                  ) : null}
                </td>
                {defs.map((d) => cell(r, d, true))}
              </tr>
            ))}
            <tr className="rep-total lb-avg">
              <td className="rep-name">Team average</td>
              {defs.map((d) => {
                const a = avg.get(d.key);
                return (
                  <td key={d.key} className="num" title={a && a.count > 0 ? `Mean of ${n(a.count)} reps with a value` : undefined}>
                    {a?.text ?? "—"}
                  </td>
                );
              })}
            </tr>
            {data.others ? (
              <tr className="lb-others">
                <td className="note">{data.others.name}</td>
                {defs.map((d) => cell(data.others as RepScore, d, false))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
