// "My pace": month-to-date submissions against quota (hero figure, the
// Opportunity Value behind them, the commission estimate, a goal bar that is
// green when on pace and yellow / red only when behind), four stat tiles
// (projected month-end, needed per working day, working days left, weekly
// goal streak), and a small bar chart of combined submissions per week for
// the last 8 weeks plus the week in progress with the weekly goal as a
// dashed line and a this-week-vs-last-week pill. Server component.

import type { RepPaceData, StreakWeek } from "@/lib/me/pace";
import Notes from "../Notes";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PILL: Record<string, { cls: string; label: string }> = { good: { cls: "pill-ok", label: "On quota" }, warn: { cls: "pill-info", label: "Halfway or better" }, bad: { cls: "pill-bad", label: "Behind" }, neutral: { cls: "pill-neutral", label: "Early in the month" } };

/** Combined submissions per week as bars, the weekly goal as a dashed line. */
function WeekChart({ weeks, goal }: { weeks: StreakWeek[]; goal: number | null }) {
  const W = 1200;
  const H = 210;
  const PAD = { l: 12, r: 12, t: 30, b: 40 };
  const max = Math.max(1, goal ?? 0, ...weeks.map((w) => w.combined ?? 0));
  const slot = (W - PAD.l - PAD.r) / Math.max(1, weeks.length);
  const barW = Math.min(64, slot * 0.6);
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  const base = H - PAD.b;
  return (
    <svg className="me-weekchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Combined submissions per week: ${weeks.map((w) => `${w.label}: ${w.combined ?? "unavailable"}`).join("; ")}`}>
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
        const cx = PAD.l + slot * i + slot / 2;
        const v = w.combined ?? 0;
        const top = y(v);
        const cls = w.met === true ? "is-met" : "is-not";
        return (
          <g key={w.start} className={`me-weekbar ${cls}${w.current ? " is-current" : ""}`}>
            <title>{`${w.label}: ${w.combined === null ? "unavailable" : n(w.combined)}${w.goal !== null ? ` of ${n(Math.round(w.goal))}` : ""}${w.current ? " (in progress)" : ""}`}</title>
            <rect x={cx - barW / 2} y={Math.min(top, base - 2)} width={barW} height={Math.max(2, base - top)} rx={4} />
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
    </svg>
  );
}

export default function PaceCard({ p }: { p: RepPaceData }) {
  const pct = p.quotaPct === null ? null : Math.round(p.quotaPct * 100);
  const fill = p.quotaPct === null ? 0 : Math.min(1, p.quotaPct);
  // Green when on pace (or on quota); the yellow / red rule applies only when behind the even pace.
  const barCls = p.quotaPct === null ? "me-bar-none" : p.onPace || p.quotaPct >= 1 ? "me-bar-good" : p.quotaPct >= 0.5 ? "me-bar-warn" : "me-bar-bad";
  const pill = PILL[p.quotaStatus] ?? PILL.neutral;
  const perDay = p.neededPerDay === null ? (p.quota > 0 && p.mtd >= p.quota ? "Quota met" : "—") : p.neededPerDay >= 20 ? n(Math.round(p.neededPerDay)) : p.neededPerDay.toFixed(1);
  const wk = p.thisWeek !== null && p.lastWeek !== null ? p.thisWeek - p.lastWeek : null;
  const wkPill = wk === null ? null : wk > 0 ? { cls: "pill-ok", text: `▲ +${n(wk)} vs last week` } : wk < 0 ? { cls: "pill-bad", text: `▼ ${n(wk)} vs last week` } : { cls: "pill-neutral", text: "same as last week" };
  return (
    <div className="stat kpi kpi-title-xl reveal me-card" data-kpi="me-pace">
      <div className="kpi-head">
        <div className="label">My pace</div>
        <div className="kpi-sub note">Combined submissions this month vs your quota · {p.monthShort}</div>
      </div>
      <div className="me-hero">
        <div className="me-hero-main">
          <div className="stat-value">
            {n(p.mtd)} <span className="me-hero-of">of {n(p.quota)}</span>
            <span className="me-hero-value" title="Opportunity Value on the submitted opportunities at the time of each event; never revenue or commission">
              {usd(p.oppValue)} <span className="me-hero-of">Opportunity Value</span>
            </span>
          </div>
          <div className="note">
            month to date · quota {n(p.quota)} · commission estimate <b>{p.commissionMtd.amount === null ? "—" : usd(p.commissionMtd.amount)}</b> ({p.commissionMtd.calc})
          </div>
        </div>
        <div className="kpi-pill">
          <span className={`pill ${pill.cls}`}>{pill.label}</span>
        </div>
      </div>
      <div className="me-goal me-goal-wide" title={pct === null ? undefined : `${pct}% of quota`}>
        <div className={`me-bar me-bar-tall ${barCls}`} role="img" aria-label={pct === null ? "No quota" : `${pct}% of quota`}>
          <span style={{ width: `${Math.round(fill * 100)}%` }} />
          {p.expectedToday !== null && p.quota > 0 ? <i className="me-bar-mark" style={{ left: `${Math.min(100, Math.round((p.expectedToday / p.quota) * 100))}%` }} title={`Expected by today: ${n(Math.round(p.expectedToday))}`} aria-hidden="true" /> : null}
        </div>
        <div className="note me-goal-text">{p.quota > 0 ? `${pct}% of quota · expected by today ${p.expectedToday === null ? "—" : n(Math.round(p.expectedToday))} (the mark) · ${p.onPace ? "on pace" : "behind pace"}` : "No monthly quota is set for you."}</div>
      </div>
      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="label">Projected month-end</div>
          <div className="stat-value">{p.projected === null ? "—" : n(p.projected)}</div>
          <div className="note stat-tile-caption">at your current rate per working day</div>
        </div>
        <div className="stat-tile">
          <div className="label">Needed per working day</div>
          <div className="stat-value">{perDay}</div>
          <div className="note stat-tile-caption">{p.quota > 0 && p.mtd < p.quota ? `${n(Math.max(0, p.quota - p.mtd))} to go` : p.quota > 0 ? "quota reached" : "no quota"}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Working days left</div>
          <div className="stat-value">{n(p.workingDaysRemaining)}</div>
          <div className="note stat-tile-caption">
            {n(p.workingDaysElapsed)} of {n(p.workingDaysTotal)} done
          </div>
        </div>
        <div className="stat-tile">
          <div className="label">Weekly goal streak</div>
          <div className="stat-value">
            {n(p.streak.count)} <span className="me-hero-of">{p.streak.count === 1 ? "week" : "weeks"}</span>
          </div>
          <div className="note stat-tile-caption">{p.streak.weeklyGoal === null ? "no weekly goal set" : `weeks at or above your goal of ${n(Math.round(p.streak.weeklyGoal))}`}</div>
        </div>
      </div>
      <div className="me-weeks">
        <div className="me-weeks-head">
          <div className="label kpi-notes-title">Combined submissions per week · last 8 weeks and this week</div>
          {wkPill ? <span className={`pill ${wkPill.cls}`} title={`This week so far ${n(p.thisWeek as number)} vs last week ${n(p.lastWeek as number)}`}>{wkPill.text}</span> : null}
        </div>
        <WeekChart weeks={p.streak.weeks} goal={p.streak.weeklyGoal} />
      </div>
      <details className="kpi-details">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={p.notes} />
        </div>
      </details>
    </div>
  );
}
