"use client";

// "My submissions" on the rep dashboard (owner request 2026-11-19, round 3
// 2026-11-20): the admin Submissions cards filtered to the signed-in rep.
// Two hero cards first (Combined submissions against the rep's goal, with
// the goal bar; Best month, with a six-month sparkline), then row 1 (Army
// CA: CA 101, Awaiting Supervisor Approval with the 5-day deadline list,
// Enrolled / Won) and row 2 (Veteran: IAU App Submitted, Accepted, Enrolled /
// Won for the selected semester). Each card's second figure is the est.
// commission its events earn under the rep's plan (count alone when the
// event does not pay); a rep never sees Opportunity Value anywhere, and every
// drilldown row carries the commission it earns (a dash when none). Clicking a card opens its drilldown for the range, clicking a chart
// point the drilldown for that hour, day, or week. Rows come from
// /api/me/drilldown, which only ever answers for the rep themself (or the
// rep an admin is viewing as).

import { useEffect, useState, type ReactNode } from "react";
import { chartSeries } from "@/lib/design";
import type { CardCommission, DeadlineList, MyMilestoneCard, MySubmissions, MyWonCard } from "@/lib/me/submissions";
import type { BestMonth, GoalPart } from "@/lib/me/shared";
import type { TimeSeries } from "@/lib/charts";
import LineChart, { type LineSeries } from "../charts/LineChart";
import { DrilldownModal, MY_KPI_COLUMNS, type ColumnKey, type DrilldownSpec } from "../Drilldown";
import KpiShell from "../KpiShell";
import Notes from "../Notes";
import SemesterPicker, { type SemesterOption } from "../SemesterPicker";
import { FillBar } from "./Animate";

const ENDPOINT = "/api/me/drilldown";
const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const DASH = "—";
/** A rep's own won rows: no Opportunity Value; the commission the won earns under the plan instead (a dash when none). */
const MY_WON_COLUMNS: ColumnKey[] = ["name", "pipeline", "stage", "wonOn", "program", "campaigns", "tags", "commission"];
/** Met / On Track / Missed, as GoalLine's StatusPill shows it (copied so this client file stays free of server-only imports). */
const STATUS: Record<NonNullable<GoalPart["status"]>, { cls: string; label: string }> = { met: { cls: "pill-ok", label: "Met" }, on_track: { cls: "pill-info", label: "On Track" }, missed: { cls: "pill-bad", label: "Missed" } };
function StatusPill({ status }: { status: GoalPart["status"] }) {
  if (!status) return null;
  return <span className={`pill ${STATUS[status].cls}`}>{STATUS[status].label}</span>;
}
const dateTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function signed(diff: number, prev: number, f: (v: number) => string): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const pct = prev === 0 ? (diff === 0 ? "0%" : "New") : `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round((diff / prev) * 100))}%`;
  return `${sign}${f(Math.abs(diff))} (${pct})`;
}

/** "+2 contacts (New) · +$150 est. commission vs prior", as the admin milestone cards show it, with commission as the second measure. */
function PairDelta({ count, prev, commission, reason, unit = "contacts" }: { count: number | null; prev: number | null; commission: CardCommission | null; reason?: string; unit?: string }) {
  if (count === null || prev === null) return <span className="kpi-muted">Comparison unavailable</span>;
  const diff = count - prev;
  const cls = diff > 0 ? "delta-up" : diff < 0 ? "delta-down" : "delta-flat";
  const money = commission && commission.prev !== null ? ` · ${signed(commission.amount - commission.prev, commission.prev, usd)} est. commission` : "";
  return (
    <span className={cls} title={`Previous period: ${n(prev)} ${unit}${commission && commission.prev !== null ? `, ${usd(commission.prev)} est. commission` : ""}.${reason ? ` ${reason}` : ""}`}>
      {signed(diff, prev, n)} {unit}
      {money} vs prior{reason ? "*" : ""}
    </span>
  );
}

/** The big number, with the est. commission beside it when the card's events pay under the plan. */
function Headline({ count, commission, unavailable, reason, unit = "Contacts" }: { count: number | null; commission: CardCommission | null; unavailable: boolean; reason?: string; unit?: string }) {
  if (unavailable)
    return (
      <>
        <div className="stat-value unavailable">unavailable</div>
        {reason ? <div className="note kpi-reason">{reason}</div> : null}
      </>
    );
  if (!commission)
    return (
      <div>
        <div className="stat-value">{n(count ?? 0)}</div>
        <div className="note">{unit}</div>
      </div>
    );
  return (
    <div className="stat-pair">
      <div>
        <div className="stat-value">{n(count ?? 0)}</div>
        <div className="note">{unit}</div>
      </div>
      <div>
        <div className="stat-value">{usd(commission.amount)}</div>
        <div className="note" title="Estimated from dashboard counts under your plan; never cash. The official commission calculation is done outside this dashboard.">
          Est. commission · {commission.label}
        </div>
      </div>
    </div>
  );
}

function chartOf(series: TimeSeries, what: string, commission: CardCommission | null): LineSeries[] {
  const per = series.grouping === "hourly" ? "per hour" : series.grouping === "daily" ? "per day" : "per week";
  const out: LineSeries[] = [{ label: `${what} ${per}`, color: chartSeries[0], points: series.points.map((p) => ({ label: p.label, value: p.count })), axis: "left", format: "count" }];
  if (commission) out.push({ label: `Est. commission ${per}`, color: chartSeries[3], points: series.points.map((p) => ({ label: p.label, value: p.value ?? 0 })), axis: "right", format: "usd" });
  return out;
}

/** A card whose body opens one drilldown for the range and another for a clicked chart point. */
function ClickableCard({ children, spec }: { children: (openBucket: (s: DrilldownSpec) => void) => ReactNode; spec: DrilldownSpec }) {
  const [open, setOpen] = useState<DrilldownSpec | null>(null);
  return (
    <div style={{ display: "contents" }} onClick={() => setOpen(spec)}>
      {children((s) => setOpen(s))}
      {open ? <DrilldownModal spec={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

// ---- milestone card -------------------------------------------------------------------------------------

function MilestoneKpi({ c, rangeQuery, rangeLabel, headRight, body, subLine }: { c: MyMilestoneCard; rangeQuery: string; rangeLabel: string; headRight?: ReactNode; body?: ReactNode; subLine?: ReactNode }) {
  const unavailable = c.achieved === null;
  const chart = chartOf(c.series, "Contacts", c.commission);
  const headline = <Headline count={c.achieved} commission={c.commission} unavailable={unavailable} reason={c.unavailableReason} />;
  const pill = <span className="pill pill-neutral">Goal not set</span>;
  const facts = [{ label: "Currently in stage (snapshot, yours)", value: n(c.currentInStage) }];
  const notes = [...c.notes, "Goal — none on this card; your only submissions goal is the combined one above (5 per week scaled by your plan)."];
  const columns: ColumnKey[] = MY_KPI_COLUMNS;
  const base: DrilldownSpec = {
    endpoint: ENDPOINT,
    query: `kind=milestone&key=${encodeURIComponent(c.key)}&${rangeQuery}`,
    title: c.title,
    subtitle: `${c.subtitle} · ${rangeLabel} · yours`,
    header: (
      <div className="kpi-value-row modal-value-row">
        <div className="kpi-value">{headline}</div>
        <div className="kpi-pill">{pill}</div>
      </div>
    ),
    expected: c.achieved,
    facts,
    chart: unavailable ? undefined : { series: chart, leftLabel: "Contacts", rightLabel: c.commission ? "Est. commission" : undefined },
    columns,
    notes,
    csvName: `${c.title} ${rangeLabel}`,
  };
  return (
    <ClickableCard spec={base}>
      {(openBucket) => (
        <KpiShell
          id={`me-${c.key}`}
          className="kpi-clickable kpi-tall me-card"
          title={c.title}
          subtitle={c.subtitle}
          headRight={headRight}
          value={headline}
          pill={pill}
          goalLine={subLine ?? <span className="kpi-muted">{c.commission ? "Goal not set · the combined goal is above" : "Goal not set · no commission attaches to this stage"}</span>}
          badges={c.partialHistory ? <span className="pill pill-warn">partial history</span> : null}
          deltaLine={<PairDelta count={c.achieved} prev={c.prev} commission={c.commission} reason={c.prevUnavailableReason} />}
          chart={
            unavailable ? (
              <div className="note">No chart: milestone events are unavailable.</div>
            ) : (
              <LineChart
                height={260}
                leftLabel="Contacts"
                rightLabel={c.commission ? "Est. commission" : undefined}
                series={chart}
                onPointClick={(i) => {
                  const p = c.series.points[i];
                  if (!p) return;
                  openBucket({ ...base, query: `${base.query}&bucket=${encodeURIComponent(p.key)}`, title: `${c.title} · ${p.label}`, subtitle: `${c.subtitle} · ${p.label} only`, header: undefined, chart: undefined, expected: p.count, csvName: `${c.title} ${p.label}` });
                }}
              />
            )
          }
          body={body}
          footer={
            <button type="button" className="kpi-details-btn">
              Details
            </button>
          }
        />
      )}
    </ClickableCard>
  );
}

// ---- won card -------------------------------------------------------------------------------------------

function WonKpi({ c, rangeQuery, rangeLabel, semesterKey }: { c: MyWonCard; rangeQuery: string; rangeLabel: string; semesterKey?: string }) {
  const chart = chartOf(c.series, "Won", c.commission);
  const headline = <Headline count={c.count} commission={c.commission} unavailable={false} unit="Won" />;
  const pill = <span className="pill pill-neutral">Goal not set</span>;
  const columns: ColumnKey[] = MY_WON_COLUMNS;
  const base: DrilldownSpec = {
    endpoint: ENDPOINT,
    query: `kind=won&program=${c.program}${semesterKey ? `&semester=${encodeURIComponent(semesterKey)}` : ""}&${rangeQuery}`,
    title: c.title,
    subtitle: `${c.subtitle} · ${rangeLabel} · yours`,
    header: (
      <div className="kpi-value-row modal-value-row">
        <div className="kpi-value">{headline}</div>
        <div className="kpi-pill">{pill}</div>
      </div>
    ),
    expected: c.count,
    chart: { series: chart, leftLabel: "Won", rightLabel: c.commission ? "Est. commission" : undefined },
    columns,
    notes: c.notes,
    csvName: `${c.title} ${rangeLabel}`,
  };
  return (
    <ClickableCard spec={base}>
      {(openBucket) => (
        <KpiShell
          id={`me-${c.key}`}
          className="kpi-clickable kpi-tall me-card"
          title={c.title}
          subtitle={c.subtitle}
          value={headline}
          pill={pill}
          goalLine={<span className="kpi-muted">{c.commission ? "Goal not set · estimates, never cash" : "Goal not set · your plan does not pay per won"}</span>}
          deltaLine={<PairDelta count={c.count} prev={c.prevCount} commission={c.commission} reason={c.prevUnavailableReason} unit="won" />}
          chart={
            <LineChart
              height={260}
              leftLabel="Won"
              rightLabel={c.commission ? "Est. commission" : undefined}
              series={chart}
              onPointClick={(i) => {
                const p = c.series.points[i];
                if (!p) return;
                openBucket({ ...base, query: `${base.query}&bucket=${encodeURIComponent(p.key)}`, title: `${c.title} · ${p.label}`, subtitle: `${c.subtitle} · ${p.label} only`, header: undefined, chart: undefined, expected: p.count, csvName: `${c.title} ${p.label}` });
              }}
            />
          }
          footer={
            <button type="button" className="kpi-details-btn">
              Details
            </button>
          }
        />
      )}
    </ClickableCard>
  );
}

// ---- the 5-day deadline list ---------------------------------------------------------------------------

/** Time left to a deadline, ticking on the client; the first render uses the server's clock so hydration matches. */
function Countdown({ deadline, asOf }: { deadline: string; asOf: string }) {
  const [now, setNow] = useState(() => Date.parse(asOf));
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const left = Date.parse(deadline) - now;
  if (left <= 0) return <span className="pill pill-bad me-dl-pill">Expired — resubmit needed</span>;
  const h = Math.floor(left / 3_600_000);
  const d = Math.floor(h / 24);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const text = d >= 1 ? `${n(d)}d ${h % 24}h left` : h >= 1 ? `${h}h ${String(m).padStart(2, "0")}m left` : `${m}m left`;
  const cls = left < 24 * 3_600_000 ? "pill-bad" : left < 48 * 3_600_000 ? "pill-gold" : "pill-ok";
  return <span className={`pill ${cls} me-dl-pill`}>{text}</span>;
}

function Deadlines({ list }: { list: DeadlineList }) {
  return (
    <div className="me-deadlines" onClick={(e) => e.stopPropagation()}>
      <div className="me-deadlines-title">
        <span>{n(list.days)}-day deadline · {n(list.rows.length)} in stage now</span>
        <span>{list.expired > 0 ? `${n(list.expired)} expired · ` : ""}{n(list.expiringSoon)} expiring within 48h</span>
      </div>
      {list.rows.length === 0 ? (
        <div className="note">None of your leads is waiting for supervisor approval right now.</div>
      ) : (
        <ul className="me-dl-list">
          {list.rows.map((r) => (
            <li key={r.opportunityId} className="me-dl">
              <div className="me-dl-main">
                <div className="me-dl-name">
                  {r.ghlUrl ? (
                    <a className="me-link" href={r.ghlUrl} target="_blank" rel="noopener noreferrer" title="Open in GHL">
                      {r.name}
                    </a>
                  ) : (
                    r.name
                  )}
                </div>
                <div className="me-dl-meta">
                  entered {dateTime.format(new Date(r.enteredAt))}
                  {r.basis === "estimated" ? " (estimated)" : r.basis === "event" ? " (dashboard time)" : ""} · due {dateTime.format(new Date(r.deadline))}
                </div>
              </div>
              <Countdown deadline={r.deadline} asOf={list.asOf} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- hero cards: combined goal + best month -----------------------------------------------------------------

/** Six months of combined submissions as a small line with the best month marked; the numbers sit in the tooltip and under the plot. */
function MonthSpark({ history }: { history: BestMonth["history"] }) {
  const W = 320;
  const H = 72;
  const padX = 10;
  const top = 10;
  const bottom = 8;
  const max = Math.max(1, ...history.map((p) => p.count));
  const k = Math.max(1, history.length);
  const x = (i: number) => (k === 1 ? W / 2 : padX + (i / (k - 1)) * (W - padX * 2));
  const y = (v: number) => H - bottom - (v / max) * (H - top - bottom);
  const d = history.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(" ");
  const area = `${d} L${x(k - 1).toFixed(1)},${H - 2} L${x(0).toFixed(1)},${H - 2} Z`;
  return (
    <div className="me-spark" onClick={(e) => e.stopPropagation()}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={`Combined submissions by month: ${history.map((p) => `${p.label} ${n(p.count)}`).join(", ")}`}>
        <title>{history.map((p) => `${p.label}: ${n(p.count)}${p.isBest ? " (best)" : p.isCurrent ? " (so far)" : ""}`).join("\n")}</title>
        {history.length > 1 ? <path d={area} fill="rgba(22,119,255,0.14)" /> : null}
        <path d={d} fill="none" stroke={chartSeries[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {history.map((p, i) => (
          <circle key={p.label} cx={x(i)} cy={y(p.count)} r={p.isBest ? 5 : 3} fill={p.isBest ? chartSeries[1] : chartSeries[0]} stroke="var(--surface-card)" strokeWidth={p.isBest ? 2 : 1.5} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="me-spark-labels" aria-hidden="true">
        {history.map((p) => (
          <span key={p.label} className={p.isBest ? "is-best" : p.isCurrent ? "is-current" : ""}>
            <b>{n(p.count)}</b>
            <i>{p.short}</i>
          </span>
        ))}
      </div>
    </div>
  );
}

function CombinedHero({ d }: { d: MySubmissions }) {
  const g: GoalPart = d.combined.goal;
  const total = d.combined.total;
  const full = g.goal ? Math.round(g.goal.full) : null;
  const byNow = g.goal ? Math.round(g.goal.scaled) : null;
  const pct = total !== null && full ? (total / full) * 100 : 0;
  const mark = full && byNow !== null && d.partial && byNow !== full ? (byNow / full) * 100 : undefined;
  const unavailable = total === null;
  return (
    <KpiShell
      id="me-combined"
      className="me-card me-hero-card"
      title="Combined submissions"
      subtitle={`CA 101 + IAU App, every semester · ${d.rangeLabel}`}
      value={
        unavailable ? (
          <>
            <div className="stat-value unavailable">unavailable</div>
            {d.combined.unavailable ? <div className="note kpi-reason">{d.combined.unavailable}</div> : null}
          </>
        ) : (
          <div>
            <div className="stat-value me-hero-num" data-me-combined={total ?? ""}>
              {n(total)}
              {full !== null ? <span className="me-hero-of"> / {n(full)} goal</span> : g.goalNote ? <span className="me-hero-of"> · {g.goalNote}</span> : null}
            </div>
            <div className="note">Submissions</div>
            <div className="note me-combined-commission" data-me-commission-range={d.commission.amount ?? ""} title="The same calculation as the admin table's Est. commission (selected range) column: every counted submission or won in the range, priced by calendar month under your plan.">
              Est. commission · <b>{d.commission.amount === null ? "—" : usd(d.commission.amount)}</b> · {d.commission.label}
              {d.commission.otherWon.count > 0 ? ` · includes ${n(d.commission.otherWon.count)} won in other Veteran stage${d.commission.otherWon.count === 1 ? "" : "s"} (${d.commission.otherWon.stages.join(", ")})` : ""}
            </div>
          </div>
        )
      }
      pill={g.status ? <StatusPill status={g.status} /> : <span className="pill pill-neutral">{g.goal ? "Goal" : "Goal not set"}</span>}
      goalLine={
        full !== null && !unavailable ? (
          <span className="kpi-muted">
            <b>{n(total)}</b> of {n(full)}
            {mark !== undefined ? ` · ${n(byNow ?? 0)} expected by now` : ""}
            {full - total > 0 ? ` · ${n(full - total)} to go` : " · goal reached"}
          </span>
        ) : (
          <span className="kpi-muted">{g.goalNote ?? "Goal — 5 per week scaled by your plan, pro-rated to the range"}</span>
        )
      }
      chart={
        full !== null && !unavailable ? (
          <div className="me-goal-block" title={`${n(total)} of ${n(full)}${mark !== undefined ? ` · the tick marks ${n(byNow ?? 0)}, where you should be by now` : ""}`}>
            <FillBar pct={pct} className="me-bar-tall me-bar-accent" label={`${n(total)} of ${n(full)} combined submissions`} mark={mark} />
            <div className="me-goal-scale" aria-hidden="true">
              <span>0</span>
              {mark !== undefined ? <span>by now {n(byNow ?? 0)}</span> : null}
              <span>goal {n(full)}</span>
            </div>
          </div>
        ) : undefined
      }
      deltaLine={
        total !== null && d.combined.prev !== null ? (
          <span className={total - d.combined.prev > 0 ? "delta-up" : total - d.combined.prev < 0 ? "delta-down" : "delta-flat"} title={`Previous period: ${n(d.combined.prev)} combined submissions.`}>
            {signed(total - d.combined.prev, d.combined.prev, n)} submissions vs prior
          </span>
        ) : (
          <span className="kpi-muted">Comparison unavailable</span>
        )
      }
    />
  );
}

function BestMonthHero({ best }: { best: BestMonth | null }) {
  if (!best)
    return (
      <KpiShell
        id="me-best-month"
        className="me-card me-hero-card"
        title="Best month"
        subtitle="Your highest calendar month of combined submissions since milestone tracking began"
        value={<div className="stat-value unavailable">{DASH}</div>}
        pill={<span className="pill pill-neutral">No history</span>}
        goalLine={<span className="kpi-muted">No combined submissions recorded yet.</span>}
        deltaLine={<span className="kpi-muted">The sparkline fills in as months are recorded.</span>}
      />
    );
  const pill = best.isCurrent ? <span className="pill pill-ok">Best so far</span> : best.toBeat === 0 ? <span className="pill pill-ok">Beaten</span> : <span className="pill pill-info">{n(best.toBeat)} away</span>;
  const line = best.isCurrent ? `${best.monthNow} is your best month so far` : best.toBeat === 0 ? `${best.monthNow} has beaten it` : `${n(best.toBeat)} away from beating it`;
  return (
    <KpiShell
      id="me-best-month"
      className="me-card me-hero-card"
      title="Best month"
      subtitle="Your highest calendar month of combined submissions since milestone tracking began"
      value={
        <div>
          <div className="stat-value me-hero-num">
            {n(best.count)}
            <span className="me-hero-of"> {best.monthLabel}</span>
          </div>
          <div className="note">Submissions</div>
        </div>
      }
      pill={pill}
      goalLine={<span className={best.toBeat === 0 && !best.isCurrent ? "delta-up" : "kpi-muted"}>{line}</span>}
      deltaLine={<span className="kpi-muted">{best.isCurrent ? `${n(best.mtd)} so far this month` : `${n(best.mtd)} so far in ${best.monthNow}`}</span>}
      chart={<MonthSpark history={best.history} />}
    />
  );
}

// ---- the section ----------------------------------------------------------------------------------------

export default function SubmissionsSection({ d, rangeQuery, rangeLabel, semesterOptions, semesterHint }: { d: MySubmissions; rangeQuery: string; rangeLabel: string; semesterOptions: SemesterOption[]; semesterHint: string }) {
  const dl = d.army.deadline;
  const approvalSub = dl.rows.length === 0 ? <span className="kpi-muted">No leads awaiting approval right now</span> : <span className={dl.expired > 0 ? "delta-down" : dl.expiringSoon > 0 ? "me-warn-text" : "kpi-muted"}>{dl.expired > 0 ? `${n(dl.expired)} expired · ` : ""}{n(dl.expiringSoon)} expiring in the next 48 hours · {n(dl.rows.length)} in stage</span>;
  return (
    <>
      <div className="kpi-row cols-2 me-hero-row">
        <CombinedHero d={d} />
        <BestMonthHero best={d.best} />
      </div>
      <div className="me-row-head">
        <span className="me-row-label">Army CA</span>
      </div>
      <div className="kpi-row cols-3">
        <MilestoneKpi c={d.army.ca101} rangeQuery={rangeQuery} rangeLabel={rangeLabel} />
        <MilestoneKpi c={d.army.approval} rangeQuery={rangeQuery} rangeLabel={rangeLabel} subLine={approvalSub} body={<Deadlines list={dl} />} />
        <WonKpi c={d.army.won} rangeQuery={rangeQuery} rangeLabel={rangeLabel} />
      </div>
      <div className="me-row-head">
        <span className="me-row-label">Veteran G.I. Bill · {d.veteran.semester.label}</span>
        <SemesterPicker options={semesterOptions} active={d.veteran.semester.key} hint={semesterHint} basePath="/me" anchor="me-submissions" />
      </div>
      <div className="kpi-row cols-3">
        <MilestoneKpi c={d.veteran.submitted} rangeQuery={rangeQuery} rangeLabel={rangeLabel} />
        <MilestoneKpi c={d.veteran.accepted} rangeQuery={rangeQuery} rangeLabel={rangeLabel} />
        <WonKpi c={d.veteran.won} rangeQuery={rangeQuery} rangeLabel={rangeLabel} semesterKey={d.veteran.semester.key} />
      </div>
      <details className="kpi-details me-sc-notes">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={d.notes} />
        </div>
      </details>
    </>
  );
}
