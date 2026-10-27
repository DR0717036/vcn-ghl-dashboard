// "My pace": month-to-date submissions against quota as a hero figure with a
// goal bar and an "expected by today" marker, four stat tiles (projected
// month-end, needed per working day, working days left, expected by today),
// and the weekly goal streak as a row of week dots. Server component.

import type { RepPaceData } from "@/lib/me/pace";
import Notes from "../Notes";

const n = (v: number) => v.toLocaleString("en-US");
const PILL: Record<string, { cls: string; label: string }> = { good: { cls: "pill-ok", label: "On quota" }, warn: { cls: "pill-info", label: "Halfway or better" }, bad: { cls: "pill-bad", label: "Behind" }, neutral: { cls: "pill-neutral", label: "Early in the month" } };

export default function PaceCard({ p }: { p: RepPaceData }) {
  const pct = p.quotaPct === null ? null : Math.round(p.quotaPct * 100);
  const fill = p.quotaPct === null ? 0 : Math.min(1, p.quotaPct);
  const barCls = p.quotaPct === null ? "me-bar-none" : p.quotaPct >= 1 ? "me-bar-good" : p.quotaPct >= 0.5 ? "me-bar-warn" : "me-bar-bad";
  const pill = PILL[p.quotaStatus] ?? PILL.neutral;
  const perDay = p.neededPerDay === null ? (p.quota > 0 && p.mtd >= p.quota ? "Quota met" : "—") : p.neededPerDay >= 20 ? n(Math.round(p.neededPerDay)) : p.neededPerDay.toFixed(1);
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
          </div>
          <div className="note">month to date · quota {n(p.quota)}</div>
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
        <div className="note me-goal-text">{p.quota > 0 ? `${pct}% of quota · expected by today ${p.expectedToday === null ? "—" : n(Math.round(p.expectedToday))} · the mark shows where an even pace would be` : "No monthly quota is set for you."}</div>
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
      <div className="me-streak" aria-label="Weekly goal streak, oldest to newest">
        {p.streak.weeks.map((w) => (
          <div key={w.start} className={`me-week ${w.met === true ? "is-met" : w.met === false ? "is-missed" : "is-unknown"}${w.current ? " is-current" : ""}`} title={`${w.label}: ${w.combined === null ? "unavailable" : `${n(w.combined)} of ${w.goal === null ? "no goal" : n(Math.round(w.goal))}`}${w.current ? " (in progress)" : ""}`}>
            <span className="me-week-dot" aria-hidden="true" />
            <span className="me-week-label">{w.label.split(" – ")[0]}</span>
            <span className="me-week-value">{w.combined === null ? "—" : n(w.combined)}</span>
          </div>
        ))}
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
