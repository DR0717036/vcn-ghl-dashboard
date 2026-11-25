// Bounties, compact (admin Rep Performance section, owner request
// 2026-11-18): the weekly bounty's status and standings, the semester
// bounty's standings, and recent weekly winners, from config/bounties.json
// and the same milestone events as the scorecard. Server component.

import type { BountyBoard, Standing } from "@/lib/bounties";
import Notes from "./Notes";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Face({ s, size = 24 }: { s: Standing; size?: number }) {
  return (
    <span className="rep-avatar" style={{ width: size, height: size }}>
      {s.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.photoUrl} alt="" width={size} height={size} />
      ) : (
        <span className="rep-avatar-initials" style={{ fontSize: size * 0.36 }}>
          {s.initials}
        </span>
      )}
    </span>
  );
}

function Standings({ rows, max, highlight }: { rows: Standing[]; max: number; highlight?: string | null }) {
  return (
    <ol className="bounty-standings">
      {rows.map((s) => (
        <li key={s.userId} className={highlight && s.userId === highlight ? "is-winner" : ""}>
          <span className="bounty-place">#{n(s.place)}</span>
          <Face s={s} />
          <span className="bounty-name">{s.name}</span>
          <span className="bounty-bar" role="img" aria-label={`${n(s.count)} of ${n(max)}`}>
            <span style={{ width: `${Math.min(100, (s.count / Math.max(1, max)) * 100)}%` }} />
          </span>
          <b className="bounty-count">{n(s.count)}</b>
        </li>
      ))}
    </ol>
  );
}

export default function BountiesCard({ b }: { b: BountyBoard }) {
  const w = b.weekly;
  const s = b.semester;
  if (!w && !s) return null;
  const semMax = s ? Math.max(1, ...s.standings.map((x) => x.count)) : 1;
  return (
    <div className="stat kpi reveal" data-kpi="bounties">
      <div className="kpi-head">
        <div className="label">Bounties</div>
        <div className="kpi-sub note">config/bounties.json · counted from the same milestone events as Program Submissions · the payout decision is made outside this dashboard</div>
      </div>
      <div className="bounty-grid">
        {w ? (
          <div className="bounty-col">
            <div className="bounty-title">
              <b className="me-bounty-amt">{usd(w.amount)}</b> weekly · {w.title}
              <span className={`pill ${w.claimed ? "pill-gold" : "pill-info"}`}>
                {w.claimed ? (
                  <>
                    Claimed · <span className="pill-name">{w.claimed.name}</span>
                  </>
                ) : w.open ? (
                  "open"
                ) : (
                  "not claimed"
                )}
              </span>
            </div>
            <div className="note">
              {w.weekLabel} · {w.counts} · {w.claimed ? `claimed on ${w.claimed.dayText}` : w.open ? `first to ${n(w.target)} wins · ends ${w.endsText}` : "nobody reached the target"}
            </div>
            <Standings rows={w.standings.slice(0, 7)} max={w.target} highlight={w.claimed?.userId ?? null} />
            <div className="note bounty-history">{w.recentWinners.length > 0 ? `Recent winners: ${w.recentWinners.map((x) => `${x.name} (${x.weekLabel})`).join(" · ")}` : "No earlier winners on record yet."}</div>
          </div>
        ) : null}
        {s ? (
          <div className="bounty-col">
            <div className="bounty-title">
              <b className="me-bounty-amt">{usd(s.amount)}</b> semester · {s.title}
            </div>
            <div className="note">
              {s.semester.label} · {s.windowText} · {s.leader ? `${s.leader.name} leads with ${n(s.leader.count)}${s.standings[1] && s.standings[1].count > 0 ? `, ${n(s.leader.count - s.standings[1].count)} ahead of ${s.standings[1].name}` : ""}` : "no submissions yet"}
            </div>
            <Standings rows={s.standings.slice(0, 7)} max={semMax} highlight={s.leader?.userId ?? null} />
          </div>
        ) : null}
      </div>
      <details className="kpi-details">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={b.notes} />
        </div>
      </details>
    </div>
  );
}
