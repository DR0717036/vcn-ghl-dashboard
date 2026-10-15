// Conversations section, stage 2 cards: Opt-outs, Interest replies, Reply
// rate by template, Inbound by channel. Template rows open a drilldown of
// the contacts and their messages; message text never appears on the cards.

import { fmtWait } from "@/lib/conversations";
import { conversationsConfig } from "@/lib/conversations";
import { rateLevel, TAG_CLASS_LABEL, type InboundChannelResult, type KeywordResult, type RateLevel, type ReplyRateResult, type TagClass, type TemplateRow } from "@/lib/messaging";
import { KEYWORD_COLUMNS, RepDrilldownRow, type DrilldownSpec } from "./Drilldown";
import CollapsibleTable from "./CollapsibleTable";
import DonutChart from "./charts/DonutChart";
import { chartSeries } from "@/lib/design";
import KpiShell from "./KpiShell";

const n = (v: number) => v.toLocaleString("en-US");
const DASH = "—";
const pct = (v: number | null, digits = 0) => (v === null ? DASH : `${(v * 100).toFixed(digits)}%`);
const SENT_BY: Record<TemplateRow["sentBy"], string> = { workflow: "Workflow", rep: "Rep (manual)", mixed: "Workflow + rep", none: DASH };
const SENT_BY_TITLE = "Workflow = GHL marks the message as sent by a workflow (GHL does not expose which one); Rep = typed by a person.";
const WORKFLOW_TITLE = "The workflow that sends this template, from config/workflow-templates.json. GHL does not record the workflow on a message, so unmapped templates say 'not mapped' until the file is filled in.";

/** Workflow cell: the mapped name, or what we do know (manual / not mapped). */
function WorkflowCell({ row }: { row: TemplateRow }) {
  if (row.key === "__rest" || row.key === "__none") return <td className="note">{DASH}</td>;
  if (row.workflow) return <td className="wf-name">{row.workflow}</td>;
  if (row.sentBy === "rep") return <td className="note">Manual (rep), no workflow</td>;
  return (
    <td className="note wf-unmapped" title={WORKFLOW_TITLE}>
      Not mapped yet
    </td>
  );
}

const LEVEL_LABEL: Record<RateLevel, string> = { high: "High", medium: "Medium", low: "Low" };
/** Opt-outs: high is bad (red). Interest: high is good (green). */
function LevelPill({ level, goodIsHigh, title }: { level: RateLevel | null; goodIsHigh: boolean; title?: string }) {
  if (!level) return <span className="note">{DASH}</span>;
  const cls = level === "medium" ? "pill-warn" : (level === "high") === goodIsHigh ? "pill-ok" : "pill-bad";
  return (
    <span className={`pill ${cls}`} title={title}>
      {LEVEL_LABEL[level]}
    </span>
  );
}
const CLASSES: TagClass[] = ["army", "veteran", "both", "untagged"];

function templateSpec(which: "optout" | "interest" | "reply", row: TemplateRow, rangeQuery: string, rangeLabel: string, notes: string[]): DrilldownSpec {
  const what = which === "optout" ? "opt-outs" : which === "interest" ? "interest replies" : "replies";
  const count = which === "optout" ? row.optOuts : which === "interest" ? row.interests : row.replies;
  return {
    query: `kind=keyword&which=${which}&template=${encodeURIComponent(row.key)}&${rangeQuery}`,
    title: `${row.label} · ${n(count)} ${what}`,
    subtitle: `${row.workflow ? `Workflow: ${row.workflow}` : row.sentBy === "rep" ? "Manual messages typed by a rep" : "Workflow not mapped yet (config/workflow-templates.json)"} · ${n(row.sends)} sends in ${rangeLabel} · best-match attribution`,
    expected: count,
    facts: [
      { label: "Sends", value: n(row.sends) },
      { label: "Replies", value: `${n(row.replies)} (${pct(row.replyRate)})` },
      { label: "Opt-outs", value: `${n(row.optOuts)} (${pct(row.optOutRate, 1)})` },
      { label: "Interest replies", value: `${n(row.interests)} (${pct(row.interestRate, 1)})` },
    ],
    columns: KEYWORD_COLUMNS,
    notes,
    csvName: `${what} ${row.label.slice(0, 40)} ${rangeLabel}`,
  };
}

export function KeywordCard({ k, rangeQuery, rangeLabel, className = "" }: { k: KeywordResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const cfg = conversationsConfig();
  const levels = k.kind === "optout" ? cfg.optOutRateLevels : cfg.interestRateLevels;
  const metric = (t: TemplateRow) => (k.kind === "optout" ? t.optOuts : t.interests);
  const rate = (t: TemplateRow) => (k.kind === "optout" ? t.optOutRate : t.interestRate);
  // donut: top five templates by count, everything else (including the summed remainder) as Other
  const ranked = [...k.rows].sort((x, y) => metric(y) - metric(x));
  const top = ranked.slice(0, 5);
  const otherCount = ranked.slice(5).reduce((s, t) => s + metric(t), 0) + (k.rest ? metric(k.rest) : 0);
  const shortName = (t: TemplateRow) => (t.workflow ? t.workflow : t.label.replace(/^“|…”$/g, "").split(" ").slice(0, 4).join(" ") + (t.key.startsWith("w:") || t.key.startsWith("m:") ? "…" : ""));
  const donut = [
    ...top.map((t, i) => ({ label: shortName(t), value: metric(t), color: chartSeries[i % chartSeries.length] as string, extra: pct(rate(t), 1) })),
    ...(otherCount > 0 ? [{ label: "Other templates", value: otherCount, color: "#8a98a9" }] : []),
  ];
  const allSpec: DrilldownSpec = {
    query: `kind=keyword&which=${k.kind}&template=all&${rangeQuery}`,
    title: `${k.title} · ${n(k.contacts)} contacts`,
    subtitle: `${rangeLabel} · one row per contact, first matching message`,
    expected: k.contacts,
    columns: KEYWORD_COLUMNS,
    notes: k.notes,
    csvName: `${k.kind} contacts ${rangeLabel}`,
  };
  return (
    <KpiShell
      id={k.kind === "optout" ? "optOuts" : "interestReplies"}
      className={`kpi-title-xl ${className}`.trim()}
      title={k.title}
      subtitle={`Inbound messages matching ${k.keywords.join(", ")} · one per contact · ${rangeLabel}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(k.contacts)}</div>
            <div className="note">Contacts</div>
          </div>
          <div>
            <div className="stat-value">{n(k.messages)}</div>
            <div className="note">Matching messages</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Best match</span>}
      goalLine={<span className="kpi-muted">Goal not set</span>}
      deltaLine={<span className="kpi-muted">{CLASSES.map((c) => `${TAG_CLASS_LABEL[c]} ${n(k.byClass[c])}`).join(" · ")}</span>}
      chart={<DonutChart segments={donut} total={k.contacts} centerLabel={k.kind === "optout" ? "opt-outs" : "interest replies"} emptyText="No matches in this period." />}
      body={
        <div className="scroll kpi-body">
          <table className="stat-breakdown rep-table rep-table-tpl">
            <colgroup>
              <col className="col-tpl" />
              <col className="col-wf" />
              <col className="col-num" />
              <col className="col-num" />
              <col className="col-num" />
              <col className="col-level" />
            </colgroup>
            <thead>
              <tr>
                <th>Template (best match)</th>
                <th title={WORKFLOW_TITLE}>Workflow</th>
                <th className="num">Sends</th>
                <th className="num combined">{k.kind === "optout" ? "Opt-outs" : "Interest"}</th>
                <th className="num">Rate</th>
                <th className="status">{k.kind === "optout" ? "Opt-out level" : "Interest level"}</th>
              </tr>
            </thead>
            <tbody>
              {k.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="note">
                    No matches in this period.
                  </td>
                </tr>
              ) : null}
              {k.rows.map((t) => (
                <RepDrilldownRow key={t.key} spec={templateSpec(k.kind, t, rangeQuery, rangeLabel, k.notes)}>
                  <td className="rep-name tpl-label" title={t.label}>
                    {t.label}
                  </td>
                  <WorkflowCell row={t} />
                  <td className="num">{n(t.sends)}</td>
                  <td className="num combined">{n(metric(t))}</td>
                  <td className="num">{pct(rate(t), 1)}</td>
                  <td className="status">
                    <LevelPill level={rateLevel(rate(t), levels)} goodIsHigh={k.kind === "interest"} title={`${pct(rate(t), 1)} · high ≥ ${(levels.high * 100).toFixed(1)}%, medium ≥ ${(levels.medium * 100).toFixed(1)}%`} />
                  </td>
                </RepDrilldownRow>
              ))}
              {k.rest ? (
                <tr>
                  <td className="note">{k.rest.label}</td>
                  <td className="note">{DASH}</td>
                  <td className="num">{n(k.rest.sends)}</td>
                  <td className="num combined">{n(metric(k.rest))}</td>
                  <td className="num">{pct(rate(k.rest), 1)}</td>
                  <td className="status">
                    <span className="note">{DASH}</span>
                  </td>
                </tr>
              ) : null}
              <RepDrilldownRow spec={allSpec}>
                <td className="rep-name">All contacts</td>
                <td className="note">—</td>
                <td className="num">{DASH}</td>
                <td className="num combined">{n(k.contacts)}</td>
                <td className="num">{DASH}</td>
                <td className="status">
                  <span className="note">{DASH}</span>
                </td>
              </RepDrilldownRow>
            </tbody>
          </table>
        </div>
      }
      sections={[{ title: "Contacts by tag", rows: CLASSES.map((c) => ({ label: TAG_CLASS_LABEL[c], value: n(k.byClass[c]) })) }]}
      notes={k.notes}
    />
  );
}

function EmailTiles({ e, rangeLabel }: { e: NonNullable<ReplyRateResult["emailStats"]>; rangeLabel: string }) {
  const tiles: { label: string; value: string; caption: string; unavailable?: boolean }[] = [
    { label: "Emails sent", value: n(e.sent), caption: `outbound emails · ${rangeLabel}` },
    { label: "Bounced", value: "unavailable", caption: `GHL reports no bounce status (${n(e.failed)} failed sends are send errors, not bounces)`, unavailable: true },
    { label: "Delivery rate", value: "unavailable", caption: `GHL leaves emails at status "sent"; only ${n(e.delivered)} of ${n(e.sent)} marked delivered`, unavailable: true },
    { label: "Opt-out rate", value: "unavailable", caption: "GHL exposes no email unsubscribe event or dated opt-out", unavailable: true },
  ];
  return (
    <div className="stat-tiles" data-check={JSON.stringify({ sent: e.sent })}>
      {tiles.map((t) => (
        <div key={t.label} className={`stat-tile${t.unavailable ? " is-unavailable" : ""}`}>
          <div className="label">{t.label}</div>
          <div className={`stat-value${t.unavailable ? " unavailable" : ""}`}>{t.value}</div>
          <div className="note stat-tile-caption">{t.caption}</div>
        </div>
      ))}
    </div>
  );
}

export function ReplyRateCard({ r, rangeQuery, rangeLabel, className = "" }: { r: ReplyRateResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const t = r.totals;
  return (
    <KpiShell
      id={r.channel === "email" ? "replyRateEmail" : "replyRateSms"}
      className={`kpi-title-xl card-channel card-${r.channel} ${className}`.trim()}
      title={`${r.channelLabel} Reply Rate by Template`}
      subtitle={`${r.channelLabel} templates that sent in ${rangeLabel}, most sends first · replies, opt-outs, and interest replies attributed by best match`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(t.sends)}</div>
            <div className="note">{r.channelLabel} sends</div>
          </div>
          <div>
            <div className="stat-value">{pct(t.sends ? t.replies / t.sends : null, 1)}</div>
            <div className="note">Reply rate</div>
          </div>
        </div>
      }
      pill={<span className={`pill ${r.channel === "email" ? "pill-email" : "pill-sms"}`}>{r.channelLabel} only</span>}
      goalLine={<span className="kpi-muted">Goal not set</span>}
      deltaLine={
        <span className="kpi-muted">
          {n(t.replies)} replies · {n(t.optOuts)} opt-outs ({pct(t.sends ? t.optOuts / t.sends : null, 1)}) · {n(t.interests)} interest replies ({pct(t.sends ? t.interests / t.sends : null, 1)})
        </span>
      }
      body={
        <>
        {r.emailStats ? <EmailTiles e={r.emailStats} rangeLabel={rangeLabel} /> : null}
        <CollapsibleTable rows={r.rows.length + (r.rest ? 1 : 0) + 1}>
        <div className="scroll kpi-body">
          <table className="stat-breakdown rep-table rep-table-tpl rep-table-tpl-wide">
            <colgroup>
              <col className="col-tpl" />
              <col className="col-wf" />
              <col className="col-num" />
              <col className="col-num" />
              <col className="col-num" />
              <col className="col-num" />
              <col className="col-num" />
              <col className="col-split" />
              <col className="col-split" />
            </colgroup>
            <thead>
              <tr>
                <th>Template (best match)</th>
                <th title={WORKFLOW_TITLE}>Workflow</th>
                <th className="num">Sends</th>
                <th className="num">Replies</th>
                <th className="num combined">Reply rate</th>
                <th className="num">Opt-out rate</th>
                <th className="num">Interest rate</th>
                <th className="num">Army sends · reply</th>
                <th className="num">Veteran sends · reply</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <RepDrilldownRow key={row.key} spec={templateSpec("reply", row, rangeQuery, rangeLabel, r.notes)}>
                  <td className="rep-name tpl-label" title={row.label}>
                    {row.label}
                  </td>
                  <WorkflowCell row={row} />
                  <td className="num">{n(row.sends)}</td>
                  <td className="num">{n(row.replies)}</td>
                  <td className="num combined">{pct(row.replyRate, 1)}</td>
                  <td className="num">{pct(row.optOutRate, 1)}</td>
                  <td className="num">{pct(row.interestRate, 1)}</td>
                  <td className="num">{row.sendsBy.army ? `${n(row.sendsBy.army)} · ${pct(row.repliesBy.army / row.sendsBy.army)}` : DASH}</td>
                  <td className="num">{row.sendsBy.veteran ? `${n(row.sendsBy.veteran)} · ${pct(row.repliesBy.veteran / row.sendsBy.veteran)}` : DASH}</td>
                </RepDrilldownRow>
              ))}
              {r.rest ? (
                <tr>
                  <td className="note">{r.rest.label}</td>
                  <td className="note">{DASH}</td>
                  <td className="num">{n(r.rest.sends)}</td>
                  <td className="num">{n(r.rest.replies)}</td>
                  <td className="num combined">{pct(r.rest.replyRate, 1)}</td>
                  <td className="num">{pct(r.rest.optOutRate, 1)}</td>
                  <td className="num">{pct(r.rest.interestRate, 1)}</td>
                  <td className="num">{r.rest.sendsBy.army ? `${n(r.rest.sendsBy.army)} · ${pct(r.rest.repliesBy.army / r.rest.sendsBy.army)}` : DASH}</td>
                  <td className="num">{r.rest.sendsBy.veteran ? `${n(r.rest.sendsBy.veteran)} · ${pct(r.rest.repliesBy.veteran / r.rest.sendsBy.veteran)}` : DASH}</td>
                </tr>
              ) : null}
              <tr className="rep-total">
                <td className="rep-name">All {r.channelLabel} templates ({n(r.templateCount)})</td>
                <td />
                <td className="num">{n(t.sends)}</td>
                <td className="num">{n(t.replies)}</td>
                <td className="num combined">{pct(t.sends ? t.replies / t.sends : null, 1)}</td>
                <td className="num">{pct(t.sends ? t.optOuts / t.sends : null, 1)}</td>
                <td className="num">{pct(t.sends ? t.interests / t.sends : null, 1)}</td>
                <td className="num">{DASH}</td>
                <td className="num">{DASH}</td>
              </tr>
            </tbody>
          </table>
        </div>
        </CollapsibleTable>
        </>
      }
      notes={r.notes}
    />
  );
}

export function InboundChannelCard({ c, rangeLabel, className = "" }: { c: InboundChannelResult; rangeLabel: string; className?: string }) {
  return (
    <KpiShell
      id="inboundChannel"
      className={`kpi-title-xl ${className}`.trim()}
      title="Inbound by Channel"
      subtitle={`Inbound messages and calls in ${rangeLabel} · after-hours = outside ${c.windowLabel}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(c.total)}</div>
            <div className="note">Inbound (all channels)</div>
          </div>
          <div>
            <div className="stat-value">{pct(c.afterHours.share)}</div>
            <div className="note">After hours (SMS + email)</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">No goal</span>}
      goalLine={<span className="kpi-muted">Goal not set</span>}
      deltaLine={
        <span className="kpi-muted">
          After-hours median first reply: {c.afterHours.medianBusinessMinutes === null ? DASH : fmtWait(c.afterHours.medianBusinessMinutes)} business time · {c.afterHours.medianClockMinutes === null ? DASH : fmtWait(c.afterHours.medianClockMinutes)} clock time ({n(c.afterHours.replied)} of {n(c.afterHours.count)} replied)
        </span>
      }
      body={
        <div className="scroll kpi-body">
          <table className="stat-breakdown rep-table rep-table-conv">
            <colgroup>
              <col className="col-name" />
              <col className="col-num" />
              <col className="col-num" />
            </colgroup>
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num combined">Inbound</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((row) => (
                <tr key={row.channel}>
                  <td className="rep-name">{row.channel}</td>
                  <td className="num combined">{n(row.inbound)}</td>
                  <td className="num">{pct(row.share)}</td>
                </tr>
              ))}
              <tr className="rep-total">
                <td className="rep-name">All channels</td>
                <td className="num combined">{n(c.total)}</td>
                <td className="num">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      }
      sections={[
        {
          title: "SMS + email by arrival time",
          rows: [
            { label: `After hours (outside ${c.windowLabel})`, value: `${n(c.afterHours.count)} · ${pct(c.afterHours.share)}` },
            { label: "After hours replied by a person", value: `${n(c.afterHours.replied)} of ${n(c.afterHours.count)}` },
            { label: "After hours median first reply (business time)", value: c.afterHours.medianBusinessMinutes === null ? DASH : fmtWait(c.afterHours.medianBusinessMinutes) },
            { label: "After hours median first reply (clock time)", value: c.afterHours.medianClockMinutes === null ? DASH : fmtWait(c.afterHours.medianClockMinutes) },
            { label: "During business hours", value: n(c.businessHours.count) },
            { label: "During hours median first reply (business time)", value: c.businessHours.medianBusinessMinutes === null ? DASH : fmtWait(c.businessHours.medianBusinessMinutes) },
          ],
        },
      ]}
      notes={c.notes}
    />
  );
}
