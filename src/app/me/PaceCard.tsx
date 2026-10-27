// "My pace": month-to-date submissions against quota with this month's
// commission estimate as the headline dollar figure and its calculation as
// the sub-line, a "Potential" line (what the month pays at the plan's next
// threshold), a blue goal bar with the even-pace mark, four stat tiles
// (projected month-end, needed per working day, working days left, weekly
// goal streak), a daily motivational line, and the interactive weekly chart
// (WeekChart.tsx). Server component apart from the chart.

import type { RepPaceData } from "@/lib/me/pace";
import Notes from "../Notes";
import WeekChart from "./WeekChart";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PILL: Record<string, { cls: string; label: string }> = { good: { cls: "pill-ok", label: "On quota" }, warn: { cls: "pill-info", label: "Halfway or better" }, bad: { cls: "pill-bad", label: "Behind" }, neutral: { cls: "pill-neutral", label: "Early in the month" } };

export default function PaceCard({ p }: { p: RepPaceData }) {
  const pct = p.quotaPct === null ? null : Math.round(p.quotaPct * 100);
  const fill = p.quotaPct === null ? 0 : Math.min(1, p.quotaPct);
  // The dashboard accent blue (owner edit, round 2); the pace mark shows where an even pace would be.
  const barCls = p.quotaPct === null ? "me-bar-none" : "me-bar-accent";
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
            <span className="me-hero-value" title="This month's commission estimate under your plan; the official calculation is done outside this dashboard">
              {p.commissionMtd.amount === null ? "—" : usd(p.commissionMtd.amount)} <span className="me-hero-of">commission</span>
            </span>
          </div>
          <div className="note">
            month to date · quota {n(p.quota)} · commission estimate: {p.commissionMtd.calc}
          </div>
          {p.potential ? (
            <div className="me-potential">
              <span className="label">Potential</span> {p.potential}
            </div>
          ) : null}
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
          <div>
            <div className="label kpi-notes-title">Combined submissions per week · last 8 weeks and this week</div>
            <div className="me-motto">{p.motto}</div>
          </div>
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
