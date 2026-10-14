// Rep Call Activity (owner edits round 8): one row per sales rep with dials,
// call-goal status, talk time, average talk time per call, talk-time goal
// status, and average first-call time, plus other users and a team total
// that reconciles with the Calls Made and Talk Time cards. Clicking a row
// opens that user's calls for the range.

import { fmtMinutes } from "@/lib/metrics";
import { fmtDuration, type RepCallRow, type RepCallsResult } from "@/lib/repCalls";
import { CALL_COLUMNS, RepDrilldownRow, type DrilldownSpec } from "./Drilldown";
import { GoalPill, GoalText, StatusPill } from "./GoalLine";
import KpiShell from "./KpiShell";

const n = (v: number) => v.toLocaleString("en-US");
const DASH = "—";
const mins = (sec: number) => fmtMinutes(Math.round(sec / 60));

export default function RepCallsCard({ r, rangeQuery, rangeLabel, className = "" }: { r: RepCallsResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const notes = [...r.notes];
  if (r.unmatchedReps.length > 0) notes.push(`Not found among GHL users (check the userId in config/sales-reps.json): ${r.unmatchedReps.map((x) => x.name).join(", ")}.`);

  const spec = (row: RepCallRow, user: string): DrilldownSpec => ({
    query: `kind=calls&user=${encodeURIComponent(user)}&${rangeQuery}`,
    title: `${row.name} · ${n(row.dials)} ${row.dials === 1 ? "dial" : "dials"}`,
    subtitle: `Calls in the selected range · ${rangeLabel}`,
    facts: [
      { label: "Total talk time", value: mins(row.talkSeconds), title: "Recorded duration of connected calls in the range." },
      { label: "Avg talk time per call", value: row.avgSeconds === null ? DASH : fmtDuration(row.avgSeconds), title: `${n(row.connected)} connected calls counted.` },
      { label: "First call (avg)", value: row.firstCallAvg ?? DASH, title: `Average of the first outbound attempt on each of the ${n(row.firstCallDays)} days with any outbound call.` },
    ],
    columns: CALL_COLUMNS,
    perDayTable: { title: "Per day: dials, talk time, and first outbound call" },
    notes,
    csvName: `${row.name} calls ${rangeLabel}`,
  });

  const cells = (row: RepCallRow) => (
    <>
      <td className="num dials">{n(row.dials)}</td>
      <td className="status">
        {row.callStatus ? (
          <StatusPill status={row.callStatus} title={row.callGoal ? `Own goal ${Math.round(row.callGoal.full)} dials${row.callGoal.scaled !== row.callGoal.full ? ` (${Math.round(row.callGoal.scaled)} by now)` : ""}` : undefined} />
        ) : (
          <span className="note">{row.isRep ? "no goal" : "not a rep"}</span>
        )}
      </td>
      <td className="num talk">{row.talkSeconds > 0 ? mins(row.talkSeconds) : DASH}</td>
      <td className="num" title={`${n(row.connected)} connected calls`}>
        {row.avgSeconds === null ? DASH : fmtDuration(row.avgSeconds)}
      </td>
      <td className="status">
        {row.talkStatus ? (
          <StatusPill status={row.talkStatus} title={row.talkGoalMinutes ? `Own goal ${fmtMinutes(Math.round(row.talkGoalMinutes.full))}${row.talkGoalMinutes.scaled !== row.talkGoalMinutes.full ? ` (${fmtMinutes(Math.round(row.talkGoalMinutes.scaled))} by now)` : ""}` : undefined} />
        ) : (
          <span className="note">{row.isRep ? "no goal" : "not a rep"}</span>
        )}
      </td>
      <td className="num first" title={row.firstCallDays > 0 ? `Average over ${n(row.firstCallDays)} ${row.firstCallDays === 1 ? "day" : "days"} with outbound calls` : "No outbound calls in the range"}>
        {row.firstCallAvg ?? DASH}
      </td>
    </>
  );

  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-calls">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-status" />
          <col className="col-talk" />
          <col className="col-talk" />
          <col className="col-status" />
          <col className="col-first" />
        </colgroup>
        <thead>
          <tr>
            <th>Sales rep</th>
            <th className="num">Dials</th>
            <th className="status">Call goal</th>
            <th className="num">Total talk time</th>
            <th className="num">Avg talk / call</th>
            <th className="status">Talk time goal</th>
            <th className="num">First call (avg)</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row) => (
            <RepDrilldownRow key={row.userId ?? row.name} spec={spec(row, row.userId ?? "others")}>
              <td className="rep-name">{row.name}</td>
              {cells(row)}
            </RepDrilldownRow>
          ))}
          {r.others ? (
            <RepDrilldownRow spec={spec(r.others, "others")}>
              <td className="note">{r.others.name}</td>
              {cells(r.others)}
            </RepDrilldownRow>
          ) : null}
          <tr className="rep-total">
            <td className="rep-name">Team total</td>
            <td className="num dials">{n(r.total.dials)}</td>
            <td className="status">
              <GoalPill goal={r.callsGoal} value={r.total.dials} />
            </td>
            <td className="num talk">{r.total.talkSeconds > 0 ? mins(r.total.talkSeconds) : DASH}</td>
            <td className="num">{r.total.avgSeconds === null ? DASH : fmtDuration(r.total.avgSeconds)}</td>
            <td className="status">
              <GoalPill goal={r.talkGoal} value={Math.round(r.total.talkSeconds / 60)} />
            </td>
            <td className="num">{DASH}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <KpiShell
      id="repCalls"
      className={`kpi-title-xl ${className}`.trim()}
      title="Rep Call Activity"
      subtitle="Outbound human dials, recorded talk time, and first-call time per sales rep · selected range"
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(r.total.dials)}</div>
            <div className="note">Dials (team)</div>
          </div>
          <div>
            <div className="stat-value">{mins(r.total.talkSeconds)}</div>
            <div className="note">Talk time (team)</div>
          </div>
        </div>
      }
      pill={<GoalPill goal={r.callsGoal} value={r.total.dials} />}
      goalLine={
        <span>
          Calls: <GoalText goal={r.callsGoal} value={r.total.dials} />
        </span>
      }
      deltaLine={
        <span>
          Talk time: <GoalText goal={r.talkGoal} value={Math.round(r.total.talkSeconds / 60)} format="minutes" />
          <GoalPill goal={r.talkGoal} value={Math.round(r.total.talkSeconds / 60)} />
        </span>
      }
      body={table}
      notes={notes}
    />
  );
}
