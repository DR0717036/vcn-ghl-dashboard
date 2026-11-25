// "My overview": three tall cards at the top of the rep dashboard (owner
// redesign 2026-11-18). 1. Momentum (this week vs the weekly goal, what the
// next submission is worth, the pay ladder, the Army / Veteran split, the
// last submission), or Commission earned this month with the count-up once
// the month's estimate reaches $1,000. 2. Next milestone as a donut with
// the projected month-end and the needed per working day. 3. Bounties: the
// rep's rank, then the weekly and semester bounties with their own standing.
// Server component; the donut and the animations are small client pieces.

import { chartSeries } from "@/lib/design";
import type { Milestone, Momentum, RepBounties, RepOverview } from "@/lib/me/overview";
import DonutChart from "../charts/DonutChart";
import Notes from "../Notes";
import { CountUp, FillBar } from "./Animate";
import SplitTiles from "./SplitTiles";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const GOOD = "#22a06b";
const REMAINDER = "rgba(255, 255, 255, 0.10)";

function MomentumTile({ m, monthLabel, asQuery }: { m: Momentum; monthLabel: string; asQuery: string }) {
  const goal = m.weeklyGoal;
  const pct = goal && goal > 0 && m.thisWeek !== null ? (m.thisWeek / goal) * 100 : 0;
  const met = goal !== null && m.thisWeek !== null && m.thisWeek >= goal - 1e-9;
  return (
    <div className="stat-tile me-ov">
      <div className="label">Momentum · this week</div>
      <div className="stat-value me-ov-big">
        {m.thisWeek === null ? "—" : n(m.thisWeek)} <span className="me-hero-of">/ {goal === null ? "—" : n(Math.round(goal))}</span>
      </div>
      <div className="me-goal" title={goal === null ? "No weekly goal" : `${n(m.thisWeek ?? 0)} of ${n(Math.round(goal))} this week`}>
        <FillBar pct={pct} className={`me-bar-thin ${met ? "me-bar-good" : "me-bar-accent"}`} label={goal === null ? "No weekly goal" : `${n(m.thisWeek ?? 0)} of ${n(Math.round(goal))} this week`} />
        <div className="note me-goal-text">{goal === null ? "no weekly goal set" : met ? "weekly goal met" : `${n(Math.max(0, Math.round(goal) - (m.thisWeek ?? 0)))} to go this week`}</div>
      </div>
      {m.nextWorth ? (
        <div className="me-ov-line">
          Next {m.nextWorth.unit} is worth <b>{usd(m.nextWorth.amount)}</b>
          {m.nextWorth.note ? <span className="note"> · {m.nextWorth.note}</span> : null}
        </div>
      ) : (
        <div className="me-ov-line note">No commission plan configured</div>
      )}
      {m.ladder.length > 0 ? (
        <div className="me-ladder" aria-label="Pay ladder">
          {m.ladder.map((r, i) => (
            <span key={r.label} className={`me-rung${r.done ? " is-done" : ""}`}>
              {i > 0 ? <span className="me-rung-sep" aria-hidden="true">·</span> : null}
              {r.label} → <b>{usd(r.amount)}</b>
            </span>
          ))}
        </div>
      ) : null}
      <div className="me-ov-bottom">
        <SplitTiles m={m} monthLabel={monthLabel} asQuery={asQuery} />
        <div className="note me-ov-last">
          Last submission: <b>{m.lastSubmission.text}</b>
          {m.lastSubmission.day ? ` · ${m.lastSubmission.day} · ${m.lastSubmission.event}` : " · keep going"}
        </div>
      </div>
    </div>
  );
}

function CommissionTile({ o }: { o: RepOverview }) {
  const m = o.momentum;
  return (
    <div className="stat-tile me-ov">
      <div className="label">Commission earned this month</div>
      <div className="stat-value me-ov-big">{o.commission.amount === null ? "—" : <CountUp value={o.commission.amount} />}</div>
      <div className="note stat-tile-caption">
        estimated · {o.commission.calc}
        {o.commission.planLabel ? ` · ${o.commission.planLabel}` : ""}
      </div>
      {m.nextWorth ? (
        <div className="me-ov-line">
          Next {m.nextWorth.unit} is worth <b>{usd(m.nextWorth.amount)}</b>
          {m.nextWorth.note ? <span className="note"> · {m.nextWorth.note}</span> : null}
        </div>
      ) : null}
      {m.ladder.length > 0 ? (
        <div className="me-ladder" aria-label="Pay ladder">
          {m.ladder.map((r, i) => (
            <span key={r.label} className={`me-rung${r.done ? " is-done" : ""}`}>
              {i > 0 ? <span className="me-rung-sep" aria-hidden="true">·</span> : null}
              {r.label} → <b>{usd(r.amount)}</b>
            </span>
          ))}
        </div>
      ) : null}
      <div className="me-ov-stats">
        <div className="me-ov-stat">
          <div className="me-ov-k">This week</div>
          <div className="me-ov-v">
            {m.thisWeek === null ? "—" : n(m.thisWeek)} <span className="note">/ {m.weeklyGoal === null ? "—" : n(Math.round(m.weeklyGoal))} goal</span>
          </div>
        </div>
        <div className="me-ov-stat">
          <div className="me-ov-k">Last submission</div>
          <div className="me-ov-v">{m.lastSubmission.text}</div>
          <div className="note">{m.lastSubmission.day ? `${m.lastSubmission.day} · ${m.lastSubmission.event}` : "keep going"}</div>
        </div>
      </div>
    </div>
  );
}

function MilestoneTile({ m }: { m: Milestone }) {
  const p = m.progress;
  const value = p ? Math.min(p.value, p.max) : 0;
  const segments = p ? (m.done ? [{ label: m.unit === "won" ? "Reached" : "Retro unlocked", value: p.max, color: GOOD, tip: m.tipDone ?? undefined }] : [{ label: m.unit === "won" ? "Won" : "Submitted", value, color: chartSeries[0], tip: m.tipDone ?? undefined }, { label: "To go", value: Math.max(0, p.max - value), color: REMAINDER, tip: m.tipLeft ?? undefined }]) : [];
  const perDay = m.neededPerDay === null ? (m.quota > 0 && m.mtd >= m.quota ? "Quota met" : "—") : m.neededPerDay >= 20 ? n(Math.round(m.neededPerDay)) : m.neededPerDay.toFixed(1);
  return (
    <div className="stat-tile me-ov" data-me-milestone-mtd={m.mtd}>
      <div className="label">{m.title}</div>
      <div className="me-donut-row">
        {p ? (
          <div className={`me-donut${m.done ? " is-done" : ""}`}>
            <DonutChart segments={segments} total={p.value} centerLabel={`of ${n(p.max)}`} size={128} />
          </div>
        ) : null}
        <div className="me-donut-side">
          <div className={`me-milestone${m.done ? " is-done" : ""}`}>{m.text}</div>
          <div className="note">{m.detail}</div>
        </div>
      </div>
      <div className="me-ov-stats">
        <div className="me-ov-stat">
          <div className="me-ov-k">Projected month-end</div>
          <div className="me-ov-v">{m.projected === null ? "—" : n(m.projected)}</div>
          <div className="note">at your current rate per working day{m.quota > 0 ? ` · quota ${n(m.quota)}` : ""}</div>
        </div>
        <div className="me-ov-stat">
          <div className="me-ov-k">Needed per working day</div>
          <div className="me-ov-v">{perDay}</div>
          <div className="note">{m.quota > 0 && m.mtd < m.quota ? `${n(Math.max(0, m.quota - m.mtd))} to go · ${n(m.workingDaysRemaining)} working day${m.workingDaysRemaining === 1 ? "" : "s"} left` : m.quota > 0 ? "quota reached" : "no quota set"}</div>
        </div>
      </div>
    </div>
  );
}

function BountiesTile({ o }: { o: RepOverview }) {
  const r = o.rank;
  const b: RepBounties = o.bounties;
  const rankDelta = r.delta === null ? null : r.delta > 0 ? { cls: "delta-up", text: `▲ up ${n(r.delta)} vs last month (#${r.lastRank})` } : r.delta < 0 ? { cls: "delta-down", text: `▼ down ${n(-r.delta)} vs last month (#${r.lastRank})` } : { cls: "delta-flat", text: `same as last month (#${r.lastRank})` };
  const w = b.weekly;
  const s = b.semester;
  const wMine = w?.mine?.count ?? 0;
  const wPct = w ? Math.min(100, (wMine / Math.max(1, w.target)) * 100) : 0;
  return (
    <div className="stat-tile me-ov">
      <div className="label">Bounties</div>
      <div className="me-ov-rank">
        <span className="stat-value" data-me-rank={r.rank ?? ""}>{r.rank === null ? "—" : `#${r.rank}`}</span> <span className="me-hero-of">of {n(r.of)} this month</span>
        <div className="note">
          {n(r.mtd)} submissions
          {rankDelta ? (
            <>
              {" · "}
              <span className={rankDelta.cls}>{rankDelta.text}</span>
            </>
          ) : (
            " · no rank last month"
          )}
        </div>
      </div>
      {w ? (
        <div className={`me-bounty${w.claimed ? " is-claimed" : ""}`}>
          <div className="me-bounty-head">
            <b className="me-bounty-amt">{usd(w.amount)}</b> <span>weekly bounty</span>
            <span className={`pill ${w.claimed ? "pill-gold" : "pill-info"}`}>
              {w.claimed ? (
                <>
                  Claimed · <span className="pill-name">{w.claimed.userId === w.mine?.userId ? "you" : w.claimed.name}</span>
                </>
              ) : (
                "open"
              )}
            </span>
          </div>
          <div className="note">
            {w.title} ({w.counts})
          </div>
          {w.claimed ? (
            <div className="me-bounty-claimed">
              {w.claimed.userId === w.mine?.userId ? "You claimed it" : "Claimed"} on <b>{w.claimed.dayText}</b>
              {w.claimed.userId === w.mine?.userId ? null : <span className="note"> · you: {n(wMine)} of {n(w.target)} this week</span>}
            </div>
          ) : (
            <>
              <div className="me-goal" title={`You: ${n(wMine)} of ${n(w.target)} this week`}>
                <FillBar pct={wPct} className="me-bar-thin me-bar-accent" label={`You: ${n(wMine)} of ${n(w.target)}`} />
              </div>
              <div className="note me-goal-text">
                You: <b>{n(wMine)}</b> of {n(w.target)}
                {w.leader ? (
                  <>
                    {" · leader "}
                    <b>{w.leader.userId === w.mine?.userId ? "you" : w.leader.name}</b> {n(w.leader.count)}
                  </>
                ) : (
                  " · no submissions yet this week"
                )}
                {" · ends "}
                {w.endsText}
              </div>
            </>
          )}
          {w.recentWinners.length > 0 ? <div className="note me-bounty-history">Last week{w.recentWinners.length > 1 ? "s" : ""}: {w.recentWinners.slice(0, 3).map((x) => `${x.name} (${x.weekLabel})`).join(" · ")}</div> : null}
        </div>
      ) : null}
      {s ? (
        <div className="me-bounty">
          <div className="me-bounty-head">
            <b className="me-bounty-amt">{usd(s.amount)}</b> <span>semester bounty</span>
            {s.mine && s.leader && s.mine.count > 0 && s.mine.place === 1 ? <span className="pill pill-ok">leading</span> : null}
          </div>
          <div className="note">{s.title}</div>
          <div className="me-bounty-standing">
            You: <b>{n(s.mine?.count ?? 0)}</b>
            {s.mine ? ` · #${n(s.mine.place)} of ${n(s.standings.length)}` : ""}
            {s.leader ? (
              s.leader.userId === s.mine?.userId && s.mine ? (
                <>
                  {" · "}
                  <span className="delta-up">you lead</span>
                  {s.standings[1] && s.standings[1].count > 0 ? ` by ${n(s.mine.count - s.standings[1].count)} over ${s.standings[1].name}` : ""}
                </>
              ) : (
                <>
                  {" · leader "}
                  <b>{s.leader.name}</b> {n(s.leader.count)}
                  {s.gap !== null ? ` · gap ${n(s.gap)}` : ""}
                </>
              )
            ) : (
              " · no submissions yet"
            )}
          </div>
          <div className="note">
            {s.semester.label} · {s.windowText}
          </div>
        </div>
      ) : null}
      {!w && !s ? <div className="note">No bounties are configured right now.</div> : null}
    </div>
  );
}

export default function OverviewCard({ o, asQuery = "" }: { o: RepOverview; asQuery?: string }) {
  return (
    <div className="stat kpi kpi-title-xl reveal me-card" data-kpi="me-overview" data-me-overview-mode={o.mode}>
      <div className="kpi-head">
        <div className="label">My overview</div>
        <div className="kpi-sub note">{o.monthLabel} · estimates from your plan and the bounty rules · the official commission and bounty decisions are made outside this dashboard</div>
      </div>
      <div className="stat-tiles me-overview me-overview-rich">
        {o.mode === "commission" ? <CommissionTile o={o} /> : <MomentumTile m={o.momentum} monthLabel={o.monthLabel} asQuery={asQuery} />}
        <MilestoneTile m={o.milestone} />
        <BountiesTile o={o} />
      </div>
      <details className="kpi-details">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={o.notes} />
        </div>
      </details>
    </div>
  );
}
