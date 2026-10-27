"use client";

// Combined submissions per week as bars (last 8 weeks plus the week in
// progress), the weekly goal as a dashed line, a smooth curve across the bar
// tops, a tooltip on hover (week, count, commission earned that week), and
// a click-through modal listing the week's submissions with the commission
// each earned, in the same modal style as the admin drilldowns.

import { useState } from "react";
import type { StreakWeek } from "@/lib/me/pace";
import { ModalShell } from "../Drilldown";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const W = 1200;
const H = 230;
const PAD = { l: 12, r: 12, t: 34, b: 44 };

/** Monotone cubic through the points (no overshoot), as the weekly report's charts draw it. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const k = pts.length;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i].y) / (dx[i] || 1));
  const m: number[] = new Array(k).fill(0);
  m[0] = slope[0];
  m[k - 1] = slope[k - 2];
  for (let i = 1; i < k - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  for (let i = 0; i < k - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const t = a * a + b * b;
    if (t > 9) {
      const tau = 3 / Math.sqrt(t);
      m[i] = tau * a * slope[i];
      m[i + 1] = tau * b * slope[i];
    }
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < k - 1; i++) {
    const third = dx[i] / 3;
    d += ` C${(pts[i].x + third).toFixed(1)},${(pts[i].y + m[i] * third).toFixed(1)} ${(pts[i + 1].x - third).toFixed(1)},${(pts[i + 1].y - m[i + 1] * third).toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function WeekModal({ w, onClose }: { w: StreakWeek; onClose: () => void }) {
  return (
    <ModalShell title={`Week of ${w.label}`} onClose={onClose} className="modal-week">
      <div className="modal-head">
        <div className="modal-title">Week of {w.label}</div>
        <div className="note modal-sub">
          {w.combined === null ? "unavailable" : `${n(w.combined)} combined submission${w.combined === 1 ? "" : "s"}`}
          {w.goal !== null ? ` · goal ${n(Math.round(w.goal))}` : ""} · commission earned {usd(w.commission)} (estimated)
          {w.current ? " · in progress" : ""}
        </div>
      </div>
      <div className="modal-table-wrap">
        <table className="drill-table">
          <thead>
            <tr>
              <th>
                <span className="th-sort th-static">Contact</span>
              </th>
              <th>
                <span className="th-sort th-static">Program</span>
              </th>
              <th>
                <span className="th-sort th-static">Date</span>
              </th>
              <th className="num">
                <span className="th-sort th-static">Commission</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {w.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="note">
                  No submissions this week{w.current ? " yet" : ""}.
                </td>
              </tr>
            ) : null}
            {w.items.map((it, i) => (
              <tr key={`${it.contactId ?? "x"}-${i}`}>
                <td>
                  <b>{it.name}</b>
                  {it.kind === "won" ? <span className="plan-label">won</span> : null}
                </td>
                <td>{it.program}</td>
                <td>{it.eventDay}</td>
                <td className="num">
                  {usd(it.amount)}
                  {it.tier ? <span className="plan-label">{it.tier}</span> : null}
                </td>
              </tr>
            ))}
            <tr className="rep-total">
              <td colSpan={3}>Week total (estimated)</td>
              <td className="num">{usd(w.commission)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note modal-note-inline">Each item is priced by its calendar month's rules (the retro rate applies to the whole month once the threshold is reached), so a week's commission can rise later in the month. Estimated; the official calculation is done outside this dashboard.</p>
    </ModalShell>
  );
}

export default function WeekChart({ weeks, goal }: { weeks: StreakWeek[]; goal: number | null }) {
  const [hot, setHot] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const max = Math.max(1, goal ?? 0, ...weeks.map((w) => w.combined ?? 0));
  const slot = (W - PAD.l - PAD.r) / Math.max(1, weeks.length);
  const barW = Math.min(64, slot * 0.6);
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  const base = H - PAD.b;
  const cxOf = (i: number) => PAD.l + slot * i + slot / 2;
  const trend = smoothPath(weeks.map((w, i) => ({ x: cxOf(i), y: y(w.combined ?? 0) })));
  const hotWeek = hot === null ? null : weeks[hot];
  return (
    <div className="me-weekchart-wrap">
      <svg className="me-weekchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Combined submissions per week: ${weeks.map((w) => `${w.label}: ${w.combined ?? "unavailable"}`).join("; ")}`} onMouseLeave={() => setHot(null)}>
        <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} className="me-weekchart-axis" />
        {goal !== null && goal > 0 ? (
          <>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(goal)} y2={y(goal)} className="me-weekchart-goal" />
            <text x={W - PAD.r} y={y(goal) - 6} textAnchor="end" className="me-weekchart-goal-label">
              weekly goal {n(Math.round(goal))}
            </text>
          </>
        ) : null}
        {weeks.map((w, i) => {
          const cx = cxOf(i);
          const v = w.combined ?? 0;
          const top = y(v);
          return (
            <g
              key={w.start}
              className={`me-weekbar ${w.met === true ? "is-met" : "is-not"}${w.current ? " is-current" : ""}${hot === i ? " is-hot" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${w.label}: ${w.combined === null ? "unavailable" : n(w.combined)} submissions, ${usd(w.commission)} commission. Open the list.`}
              onMouseEnter={() => setHot(i)}
              onFocus={() => setHot(i)}
              onClick={() => setOpen(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(i);
                }
              }}
            >
              <rect className="me-weekbar-hit" x={cx - slot / 2} y={PAD.t - 10} width={slot} height={base - PAD.t + 10} />
              <rect className="me-weekbar-bar" x={cx - barW / 2} y={Math.min(top, base - 2)} width={barW} height={Math.max(2, base - top)} rx={4} />
              <text x={cx} y={top - 8} textAnchor="middle" className="me-weekchart-value">
                {w.combined === null ? "—" : n(w.combined)}
              </text>
              <text x={cx} y={base + 20} textAnchor="middle" className="me-weekchart-label">
                {w.label.split(" – ")[0]}
              </text>
              {w.current ? (
                <text x={cx} y={base + 36} textAnchor="middle" className="me-weekchart-label me-weekchart-now">
                  this week
                </text>
              ) : null}
            </g>
          );
        })}
        {trend ? <path d={trend} className="me-weekchart-trend" /> : null}
        {weeks.map((w, i) => (
          <circle key={`dot-${w.start}`} cx={cxOf(i)} cy={y(w.combined ?? 0)} r={4} className="me-weekchart-dot" />
        ))}
      </svg>
      {hotWeek && hot !== null ? (
        <div className="me-weektip" style={{ left: `${(cxOf(hot) / W) * 100}%`, top: `${(y(hotWeek.combined ?? 0) / H) * 100}%` }} role="tooltip">
          <b>Week of {hotWeek.label}</b>
          <span>
            {hotWeek.combined === null ? "unavailable" : `${n(hotWeek.combined)} submission${hotWeek.combined === 1 ? "" : "s"}`}
            {hotWeek.goal !== null ? ` · goal ${n(Math.round(hotWeek.goal))}` : ""}
          </span>
          <span>{usd(hotWeek.commission)} commission earned · click for the list</span>
        </div>
      ) : null}
      {open !== null && weeks[open] ? <WeekModal w={weeks[open]} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
