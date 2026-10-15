// Stale conversations by rep (snapshot): unread, inbound-last conversations
// older than the configured threshold, grouped by the assigned user. Click a
// row to see the contacts, channel, last inbound message, and waiting time.

import { fmtDateTime } from "@/lib/dates";
import { fmtWait, type StaleResult, type StaleRow } from "@/lib/conversations";
import { RepDrilldownRow, STALE_COLUMNS, type DrilldownSpec } from "./Drilldown";
import KpiShell from "./KpiShell";

const n = (v: number) => v.toLocaleString("en-US");
const DASH = "—";

export default function StaleCard({ s, className = "" }: { s: StaleResult; className?: string }) {
  const spec = (row: StaleRow, user: string): DrilldownSpec => ({
    query: `kind=stale&user=${encodeURIComponent(user)}`,
    title: `${row.name} · ${n(row.conversations)} stale ${row.conversations === 1 ? "conversation" : "conversations"}`,
    subtitle: `Unread, last message inbound, waiting more than ${s.staleAfterMinutes} minutes · as of ${s.snapshotAt ? fmtDateTime(s.snapshotAt) : "the last sync"}`,
    expected: row.conversations,
    facts: [
      { label: "Stale unread messages", value: n(row.unread) },
      { label: "Oldest waiting", value: row.oldestMinutes === null ? DASH : fmtWait(row.oldestMinutes) },
    ],
    columns: STALE_COLUMNS,
    notes: s.notes,
    csvName: `${row.name} stale conversations`,
  });

  const cells = (row: StaleRow) => (
    <>
      <td className="num combined stale-count">{n(row.conversations)}</td>
      <td className="num">{n(row.unread)}</td>
      <td className="num">{row.oldestMinutes === null ? DASH : fmtWait(row.oldestMinutes)}</td>
    </>
  );

  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-conv">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
        </colgroup>
        <thead>
          <tr>
            <th>Sales rep</th>
            <th className="num combined">Stale conversations</th>
            <th className="num">Stale unread messages</th>
            <th className="num">Oldest waiting</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((row) => (
            <RepDrilldownRow key={row.userId ?? row.name} spec={spec(row, row.userId ?? "unassigned")}>
              <td className="rep-name">{row.name}</td>
              {cells(row)}
            </RepDrilldownRow>
          ))}
          <RepDrilldownRow spec={spec(s.unassigned, "unassigned")}>
            <td className="rep-name">Unassigned</td>
            {cells(s.unassigned)}
          </RepDrilldownRow>
          {s.others ? (
            <RepDrilldownRow spec={spec(s.others, "others")}>
              <td className="note">{s.others.name}</td>
              {cells(s.others)}
            </RepDrilldownRow>
          ) : null}
          <tr className="rep-total">
            <td className="rep-name">Team total</td>
            <td className="num combined stale-count">{n(s.total.conversations)}</td>
            <td className="num">{n(s.total.unread)}</td>
            <td className="num">{s.total.oldestMinutes === null ? DASH : fmtWait(s.total.oldestMinutes)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <KpiShell
      id="staleConversations"
      className={`kpi-title-xl ${className}`.trim()}
      title="Stale Conversations"
      subtitle={`Unread, last message inbound, waiting more than ${s.staleAfterMinutes} minutes · snapshot as of ${s.snapshotAt ? fmtDateTime(s.snapshotAt) : "the last sync"}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(s.total.conversations)}</div>
            <div className="note">Stale conversations</div>
          </div>
          <div>
            <div className="stat-value">{n(s.total.unread)}</div>
            <div className="note">Unread messages waiting</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Snapshot</span>}
      goalLine={<span className="kpi-muted">Goal not set</span>}
      deltaLine={
        <span className="kpi-muted">
          {n(s.unreadInboundTotal)} unread inbound-last conversations in all; {n(s.unreadInboundTotal - s.total.conversations)} newer than {s.staleAfterMinutes} minutes
        </span>
      }
      body={table}
      notes={s.notes}
    />
  );
}
