"use client";

// Rep Performance cards (owner request 2026-10-18): one card per sales rep,
// sorted by a selectable metric, with a photo or initials, role tag, rank
// badge, a stats grid with goal pills, a submissions sparkline, a goals-met
// summary, and a click-through modal whose tabs reuse the existing
// drilldowns (submissions, calls, appointments, won).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Metric, MetricDef, RepPerformance, RepScore } from "@/lib/repPerformance";
import { DrilldownBody, ModalShell } from "./Drilldown";
import Notes from "./Notes";

const n = (v: number) => v.toLocaleString("en-US");

/**
 * Reveal once per card instance: the card renders hidden (the shared "reveal"
 * style) and becomes visible the first time it enters the viewport. The state
 * lives in React, so re-sorting (which only reorders the keyed cards) never
 * hides a card again, and a card already in view stays visible.
 */
function useRevealOnce<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    if (!("IntersectionObserver" in window)) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return [ref, on];
}

// Local copy of the goal pill: GoalLine imports the goals library, which reaches the SQLite layer and cannot ship to the browser.
const PILL: Record<string, { cls: string; label: string }> = { met: { cls: "pill-ok", label: "Met" }, on_track: { cls: "pill-info", label: "On Track" }, missed: { cls: "pill-bad", label: "Missed" } };
function StatusPill({ status }: { status: string }) {
  const p = PILL[status];
  return p ? <span className={`pill ${p.cls}`}>{p.label}</span> : null;
}

export function Avatar({ r, size = 96 }: { r: RepScore; size?: number }) {
  return (
    <span className="rep-avatar" style={{ width: size, height: size }}>
      {r.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.photoUrl} alt="" width={size} height={size} />
      ) : (
        <span className="rep-avatar-initials" style={{ fontSize: size * 0.36 }}>
          {r.initials}
        </span>
      )}
    </span>
  );
}

/** Tiny inline sparkline; the numbers are in the tooltip, the line is just the shape. */
export function Sparkline({ values, labels, width = 240, height = 44 }: { values: number[]; labels: string[]; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const nPts = Math.max(1, values.length);
  const x = (i: number) => (nPts === 1 ? width / 2 : (i / (nPts - 1)) * (width - 4) + 2);
  const y = (v: number) => height - 3 - (v / max) * (height - 8);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(nPts - 1).toFixed(1)},${height - 2} L${x(0).toFixed(1)},${height - 2} Z`;
  const title = values.map((v, i) => `${labels[i]}: ${n(v)}`).join("\n");
  return (
    <svg className="rep-spark" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={`Combined submissions per period: ${values.join(", ")}`}>
      <title>{title}</title>
      {values.length > 1 ? <path d={area} fill="rgba(22,119,255,0.16)" /> : null}
      <path d={d} fill="none" stroke="#4d9bff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {values.map((v, i) => (v > 0 ? <circle key={i} cx={x(i)} cy={y(v)} r={2.2} fill="#4d9bff" /> : null))}
    </svg>
  );
}

function sortValue(r: RepScore, key: string): number | null {
  return r.metrics[key]?.value ?? null;
}

function rankReps(reps: RepScore[], key: string, defs: MetricDef[]): RepScore[] {
  const def = defs.find((d) => d.key === key);
  const lower = Boolean(def?.lowerIsBetter);
  return [...reps].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    return lower ? x - y : y - x;
  });
}

function MetricCell({ def, m }: { def: MetricDef; m: Metric }) {
  return (
    <div className="rep-stat" title={m.title}>
      <div className="rep-stat-label">{def.label}</div>
      <div className={`rep-stat-value${m.value === null && m.text !== "—" ? " note" : ""}`}>
        {m.text}
        {m.status ? <StatusPill status={m.status} /> : null}
      </div>
      {m.sub ? <div className="rep-stat-sub">{m.sub}</div> : null}
    </div>
  );
}

function RepModal({ r, rangeLabel, onClose }: { r: RepScore; rangeLabel: string; onClose: () => void }) {
  const [tab, setTab] = useState(r.tabs[0]?.key ?? "");
  const current = r.tabs.find((t) => t.key === tab) ?? r.tabs[0];
  return (
    <ModalShell title={`${r.name} · rep scorecard`} onClose={onClose} className="modal-rep">
      <div className="rep-modal-head">
        <Avatar r={r} size={72} />
        <div>
          <div className="modal-title">{r.name}</div>
          <div className="note modal-sub">
            {r.role}
            {r.planLabel ? ` · ${r.planLabel}` : ""} · {rangeLabel} · goals met {n(r.goals.met)} of {n(r.goals.of)}
          </div>
        </div>
      </div>
      <div className="answer-filter rep-tabs" role="tablist" aria-label="Rep drilldowns">
        {r.tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === current?.key} className={`seg-btn${t.key === current?.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {current ? <DrilldownBody key={current.key} spec={current.spec} /> : null}
    </ModalShell>
  );
}

function RepCard({ r, rank, def, rangeLabel, defs }: { r: RepScore; rank: number; def: MetricDef; rangeLabel: string; defs: MetricDef[] }) {
  const [open, setOpen] = useState(false);
  const [ref, revealed] = useRevealOnce<HTMLDivElement>();
  const sortMetric = r.metrics[def.key];
  return (
    <>
      <div
        ref={ref}
        className={`stat kpi rep-card reveal${revealed ? " is-visible" : ""}${rank === 1 ? " rep-card-leader" : ""}`}
        data-kpi={`rep-${r.userId ?? "others"}`}
        data-rep={r.userId ?? "others"}
        role="button"
        tabIndex={0}
        title="Click for this rep's calls, appointments, submissions, and won deals"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div className="rep-card-head">
          <Avatar r={r} />
          <div className="rep-card-id">
            <div className="rep-card-name">
              {rank === 1 ? (
                <span className="rep-crown" title={`Leader by ${def.label}`} aria-label="Leader">
                  👑
                </span>
              ) : null}
              {r.name}
            </div>
            <div className="rep-card-tags">
              <span className="pill pill-neutral">{r.role}</span>
              <span className={`pill ${rank === 1 ? "pill-gold" : "pill-info"} rep-rank`} title={`Rank by ${def.label}`}>
                #{rank}
              </span>
            </div>
            <div className="rep-card-sortval">
              <span className="note">{def.label}:</span> <b>{sortMetric?.text ?? "—"}</b>
            </div>
          </div>
        </div>
        <div className="rep-stats">
          {defs.map((d) => (
            <MetricCell key={d.key} def={d} m={r.metrics[d.key] ?? { value: null, text: "—" }} />
          ))}
        </div>
        <div className="rep-card-foot">
          <div className="rep-spark-wrap" title="Combined submissions per period">
            <div className="rep-stat-label">
              Submissions per {r.spark.values.length <= 1 ? "period" : "day"} · {n(r.spark.total)} total
            </div>
            <Sparkline values={r.spark.values} labels={r.spark.labels} />
          </div>
          <div className="rep-goals" title={r.goals.items.map((g) => `${g.label}: ${g.status === "met" ? "Met" : g.status === "on_track" ? "On Track" : "Missed"}`).join(" · ")}>
            <div className="rep-stat-label">Goals met</div>
            <div className="rep-goals-value">
              <b>{n(r.goals.met)}</b> of {n(r.goals.of)}
            </div>
            <div className="rep-goals-dots" aria-hidden="true">
              {r.goals.items.map((g) => (
                <i key={g.label} className={`rep-goal-dot rep-goal-${g.status}`} title={`${g.label}: ${g.status}`} />
              ))}
            </div>
          </div>
        </div>
        <div className="kpi-footer">
          <span className="kpi-details-btn">Open rep scorecard</span>
        </div>
      </div>
      {open ? <RepModal r={r} rangeLabel={rangeLabel} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export default function RepCards({ data, rangeLabel }: { data: RepPerformance; rangeLabel: string }) {
  const [sortKey, setSortKey] = useState(data.defaultSort);
  const def = data.defs.find((d) => d.key === sortKey) ?? data.defs[0];
  const sorted = useMemo(() => rankReps(data.reps, sortKey, data.defs), [data, sortKey]);

  // FLIP: when the order changes, each card slides from its old slot to its new one instead of jumping
  const gridRef = useRef<HTMLDivElement | null>(null);
  const lastRects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cards = [...grid.querySelectorAll<HTMLElement>("[data-rep]")];
    const next = new Map<string, DOMRect>();
    for (const el of cards) {
      const key = el.dataset.rep as string;
      const now = el.getBoundingClientRect();
      next.set(key, now);
      const prev = lastRects.current.get(key);
      if (!prev || reduced) continue;
      const dx = prev.left - now.left;
      const dy = prev.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1)";
        el.style.transform = "";
        const clear = () => {
          el.style.transition = "";
          el.removeEventListener("transitionend", clear);
        };
        el.addEventListener("transitionend", clear);
      });
    }
    lastRects.current = next;
  }, [sorted]);

  return (
    <div className="rep-section">
      <div className="rep-toolbar">
        <label className="rep-sort">
          <span className="label">Sort cards by</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {data.defs.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
                {d.lowerIsBetter ? " (lower is better)" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="note">
          {n(data.reps.length)} reps · {rangeLabel} · click a card for its drilldowns
        </span>
      </div>
      <div className="rep-grid" ref={gridRef}>
        {sorted.map((r, i) => (
          <RepCard key={r.userId ?? r.name} r={r} rank={i + 1} def={def} rangeLabel={rangeLabel} defs={data.defs} />
        ))}
      </div>
      <details className="kpi-details rep-notes">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={data.notes} />
        </div>
      </details>
    </div>
  );
}
