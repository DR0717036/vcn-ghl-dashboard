// Program Submissions (combined): CA 101 submitted + IAU App Submitted (FS2),
// per rep and team total. Carries the combined weekly rep goal, the only
// submissions goal. Same card anatomy as every other KPI card; the rep table
// is the card body.
//
// Round 6: per-rep goals (each rep's own rate), plus month-to-date columns
// to the right of Status: Monthly quota, Won (MTD), and Est. commission
// under the rep's plan. Those three are always the current calendar month,
// whatever range is selected. Clicking a row opens its drilldown.

import { isWonBased, planFor, type CommissionReport, type RepMtd } from "@/lib/commission";
import { hasRepGoals, repGoalStatus } from "@/lib/goals";
import { fmtUsd } from "@/lib/milestones";
import { salesReps } from "@/lib/reps";
import type { SubmissionRow, SubmissionsResult } from "@/lib/submissions";
import { REP_COLUMNS, RepDrilldownRow, type DrilldownSpec } from "./Drilldown";
import { GoalPill, GoalText, StatusPill } from "./GoalLine";
import KpiShell, { Delta } from "./KpiShell";

const n = (v: number) => v.toLocaleString("en-US");
const DASH = "—";

export default function SubmissionsCard({
  s,
  c,
  rangeQuery,
  rangeLabel,
  className = "",
}: {
  s: SubmissionsResult;
  c: CommissionReport;
  rangeQuery: string;
  rangeLabel: string;
  className?: string;
}) {
  const unavailable = s.value === null;
  const g = s.goal;
  const repGoalCol = hasRepGoals(g);
  const notes = [...s.notes, ...c.notes];
  if (g) notes.push(`Goal basis: ${g.basis}. Each rep is judged against their own goal; the team total against the sum.`);
  if (s.unmatchedReps.length > 0) notes.push(`Not found among GHL users (check the userId in config/sales-reps.json): ${s.unmatchedReps.map((r) => r.name).join(", ")}.`);

  const quotaTitle = `Month-to-date combined submissions over the monthly quota. Always the current calendar month (${c.monthLabel}), whatever range is selected.`;
  const mtdOf = (r: SubmissionRow): RepMtd | undefined => (r.userId ? c.reps[r.userId] : undefined);

  const rowSpec = (r: SubmissionRow, user: string): DrilldownSpec => {
    const mtd = mtdOf(r);
    const rep = salesReps.find((x) => x.userId === r.userId);
    const plan = rep ? planFor(rep) : null;
    const facts = mtd
      ? [
          { label: "Monthly quota", value: `${n(mtd.submissionsMtd)}/${n(mtd.monthlyQuota)}`, title: quotaTitle },
          { label: "Won (MTD)", value: n(mtd.wonMtd), title: `Won opportunities credited this month (${c.monthLabel}).` },
          { label: `Est. commission (${rangeLabel})`, value: `${mtd.commission.amount === null ? DASH : fmtUsd(mtd.commission.amount)} · ${mtd.commission.label}`, title: "Commission on the events inside the selected date range." },
          { label: "Est. commission (month to date)", value: `${mtd.commissionMtd.amount === null ? DASH : fmtUsd(mtd.commissionMtd.amount)} · ${mtd.commissionMtd.label}`, title: `Commission on this calendar month's events so far (${c.monthLabel}).` },
        ]
      : [{ label: "Won (MTD)", value: n(c.othersWon), title: `Won opportunities this month credited to users who are not sales reps (${c.monthLabel}).` }];
    const wonBased = !rep || isWonBased(plan);
    return {
      query: `kind=rep&user=${encodeURIComponent(user)}&${rangeQuery}`,
      title: `${r.name} · ${n(r.total)} ${r.total === 1 ? "submission" : "submissions"}`,
      subtitle: `Program Submissions (combined) · CA 101 ${n(r.ca101)} · IAU App (FS2) ${n(r.fs2)} · ${rangeLabel}`,
      expected: r.total,
      facts,
      columns: REP_COLUMNS,
      wonTable: wonBased ? { title: `Won opportunities counted this month (${c.monthLabel})`, expected: mtd ? mtd.wonMtd : c.othersWon } : undefined,
      notes: [
        "Each row is one contact reaching one stage: CA 101 submitted (Army CA) or IAU App Submitted (FS2) (Veteran G.I. Bill). A contact that reached both appears twice, once per stage, which is how the combined count works.",
        "Credit goes to the opportunity owner at the time of the event.",
        ...c.notes,
      ],
      csvName: `${r.name} submissions ${rangeLabel}`,
    };
  };

  const numCells = (r: SubmissionRow) => (
    <>
      <td className="num">{n(r.ca101)}</td>
      <td className="num">{n(r.fs2)}</td>
      <td className="num combined">{n(r.total)}</td>
    </>
  );
  const mtdCells = (r: SubmissionRow) => {
    const mtd = mtdOf(r);
    if (!mtd) {
      return (
        <>
          <td className="num note">{DASH}</td>
          <td className="num">{n(c.othersWon)}</td>
          <td className="num note">{DASH}</td>
        </>
      );
    }
    return (
      <>
        <td className={`num quota quota-${mtd.quotaStatus}`} title={quotaTitle}>
          {n(mtd.submissionsMtd)}/{n(mtd.monthlyQuota)}
        </td>
        <td className="num" title={`Won opportunities credited this month (${c.monthLabel}).`}>
          {n(mtd.wonMtd)}
        </td>
        <td className="num commission" title={`${mtd.commission.label} · ${rangeLabel}. Plan: ${mtd.planKey}.`}>
          {mtd.commission.amount === null ? DASH : fmtUsd(mtd.commission.amount)}
          <span className="plan-label">{mtd.commission.label}</span>
        </td>
      </>
    );
  };

  const table = !unavailable ? (
    <>
      <div className="scroll kpi-body">
        <table className="stat-breakdown rep-table rep-table-wide">
          <colgroup>
            <col className="col-name" />
            <col className="col-num" />
            <col className="col-num" />
            <col className="col-num" />
            {repGoalCol ? <col className="col-goal" /> : null}
            {repGoalCol ? <col className="col-status" /> : null}
            <col className="col-quota" />
            <col className="col-won" />
            <col className="col-commission" />
          </colgroup>
          <thead>
            <tr>
              <th>Sales rep</th>
              <th className="num">CA 101</th>
              <th className="num">IAU App (FS2)</th>
              <th className="num combined">Combined</th>
              {repGoalCol ? <th className="num">Rep goal</th> : null}
              {repGoalCol ? <th className="status">Status</th> : null}
              <th className="num" title={quotaTitle}>
                Monthly quota
              </th>
              <th className="num">Won (MTD)</th>
              <th className="num" title={c.planSummary}>
                Est. commission (selected range)
              </th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => {
              const rg = repGoalCol && r.userId ? g.perRep[r.userId] : undefined;
              return (
                <RepDrilldownRow key={r.userId ?? r.name} spec={rowSpec(r, r.userId ?? "others")}>
                  <td className="rep-name">{r.name}</td>
                  {numCells(r)}
                  {repGoalCol ? (
                    <td className="num">
                      {rg ? `${Math.round(rg.full)}${g.partial && !g.snapshot && Math.round(rg.scaled) !== Math.round(rg.full) ? ` (${Math.round(rg.scaled)} by now)` : ""}` : DASH}
                    </td>
                  ) : null}
                  {repGoalCol ? <td className="status">{r.userId ? <StatusPill status={repGoalStatus(r.total, g, r.userId)} /> : null}</td> : null}
                  {mtdCells(r)}
                </RepDrilldownRow>
              );
            })}
            {s.others ? (
              <RepDrilldownRow spec={rowSpec(s.others, "others")}>
                <td className="note">{s.others.name}</td>
                {numCells(s.others)}
                {repGoalCol ? <td className="num note">{DASH}</td> : null}
                {repGoalCol ? <td className="status note">not a rep</td> : null}
                {mtdCells(s.others)}
              </RepDrilldownRow>
            ) : null}
            <tr className="rep-total">
              <td className="rep-name">Team total</td>
              <td className="num">{n(s.ca101)}</td>
              <td className="num">{n(s.fs2)}</td>
              <td className="num combined">{n(s.value ?? 0)}</td>
              {repGoalCol ? <td className="num">{Math.round(g.full)}</td> : null}
              {repGoalCol ? (
                <td className="status">
                  <GoalPill goal={g} value={s.value} />
                </td>
              ) : null}
              <td className="num">{DASH}</td>
              <td className="num">{n(c.totalWon)}</td>
              <td className="num commission">
                {fmtUsd(c.totalCommission)}
                <span className="plan-label">Total est. commission · {rangeLabel}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="rep-commission-total">
        <div>
          <div className="note">Total est. commission · {rangeLabel}</div>
          <div className="stat-value">{fmtUsd(c.totalCommission)}</div>
        </div>
        <div className="note rep-commission-note">Estimated from dashboard counts; the official commission calculation is done outside this dashboard.</div>
      </div>
    </>
  ) : null;

  return (
    <KpiShell
      id={s.key}
      className={`kpi-title-xl ${className}`.trim()}
      title={s.title}
      subtitle="CA 101 submitted (Army CA) + IAU App Submitted (FS2) (Veteran G.I. Bill) · reached during period · team total"
      value={
        unavailable ? (
          <>
            <div className="stat-value unavailable">unavailable</div>
            {s.unavailableReason ? <div className="note kpi-reason">{s.unavailableReason}</div> : null}
          </>
        ) : (
          <div className="stat-pair">
            <div>
              <div className="stat-value">{n(s.value ?? 0)}</div>
              <div className="note">Contacts</div>
            </div>
            <div>
              <div className="stat-value">{fmtUsd(s.oppValue)}</div>
              <div className="note">Opportunity Value{s.oppValueMissing > 0 ? ` (${n(s.oppValueMissing)} missing)` : ""}</div>
            </div>
          </div>
        )
      }
      pill={<GoalPill goal={g} value={s.value} />}
      goalLine={<GoalText goal={g} value={s.value} />}
      badges={s.partialHistory ? <span className="pill pill-warn">partial history</span> : null}
      deltaLine={<Delta value={s.value} prev={s.prev} reason={s.prevUnavailableReason} />}
      body={table}
      notes={notes}
    />
  );
}
