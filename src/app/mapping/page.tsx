// Mapping screen: what the connected GHL account actually contains, how the
// brief's labels map onto it, and which endpoints the token may read.
// Everything shown comes from the local cache; nothing here calls GHL.

import { lastSuccessfulSync, latestSyncRuns, readSnapshots, type SnapshotRow } from "@/lib/db";
import { funnelOnlyForStage, mappingConfig, milestoneForStage } from "@/lib/mapping-config";
import {
  KEY_PREFIX,
  MAPPING_SYNC_KIND,
  type AppointmentsSnapshot,
  type CalendarsSnapshot,
  type CallsSnapshot,
  type ContactsSnapshot,
  type CustomFieldsSnapshot,
  type LocationSnapshot,
  type OpportunitiesSnapshot,
  type PipelinesSnapshot,
  type StageCountsSnapshot,
  type TagsSnapshot,
  type UsersSnapshot,
} from "@/lib/sync/mapping";
import RefreshButton from "./RefreshButton";

export const dynamic = "force-dynamic";

const TZ = mappingConfig.timezone;
const fmtDateTime = new Intl.DateTimeFormat("en-US", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
const fmtDate = new Intl.DateTimeFormat("en-US", { timeZone: TZ, dateStyle: "medium" });

function when(iso: string | null | undefined): string {
  if (!iso) return "unavailable";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unavailable" : fmtDateTime.format(d);
}

function day(iso: string | null | undefined): string {
  if (!iso) return "unavailable";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unavailable" : fmtDate.format(d);
}

function num(n: number | null | undefined): string {
  return n === null || n === undefined ? "unavailable" : n.toLocaleString("en-US");
}

function pct(part: number, whole: number): string {
  if (!whole) return "n/a";
  return `${Math.round((part / whole) * 100)}%`;
}

interface Snap<T> {
  row?: SnapshotRow;
  data?: T;
}

function pick<T>(rows: SnapshotRow[], key: string): Snap<T> {
  const row = rows.find((r) => r.key === KEY_PREFIX + key);
  if (!row) return {};
  let data: T | undefined;
  if (row.ok && row.payload) {
    try {
      data = JSON.parse(row.payload) as T;
    } catch {
      data = undefined;
    }
  }
  return { row, data };
}

function ProbePill({ row }: { row?: SnapshotRow }) {
  if (!row) return <span className="pill pill-info">not run yet</span>;
  if (row.ok) return <span className="pill pill-ok">OK</span>;
  if (row.error_kind === "permission") return <span className="pill pill-bad">permission denied</span>;
  if (row.error_kind === "skipped") return <span className="pill pill-warn">skipped</span>;
  return <span className="pill pill-bad">failed</span>;
}

function Unavailable({ row, what }: { row?: SnapshotRow; what: string }) {
  if (!row) return <p className="note">{what}: unavailable — no sync has run yet.</p>;
  return (
    <div className="callout callout-bad">
      {what}: unavailable. {row.error_kind === "permission" ? "The private integration token does not have permission to read this. " : ""}
      <span className="mono">{row.error}</span>
    </div>
  );
}

function CountTable({ title, map }: { title: string; map: Record<string, number> }) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p className="note">None observed.</p>
      ) : (
        <table>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className="num">{num(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default function MappingPage() {
  const rows = readSnapshots(KEY_PREFIX);
  const lastOk = lastSuccessfulSync(MAPPING_SYNC_KIND);
  const runs = latestSyncRuns(MAPPING_SYNC_KIND, 1);
  const lastRun = runs[0];

  const location = pick<LocationSnapshot>(rows, "location");
  const pipelines = pick<PipelinesSnapshot>(rows, "pipelines");
  const users = pick<UsersSnapshot>(rows, "users");
  const tags = pick<TagsSnapshot>(rows, "tags");
  const fields = pick<CustomFieldsSnapshot>(rows, "customFields");
  const calendars = pick<CalendarsSnapshot>(rows, "calendars");
  const appts = pick<AppointmentsSnapshot>(rows, "appointments");
  const contacts = pick<ContactsSnapshot>(rows, "contacts");
  const opps = pick<OpportunitiesSnapshot>(rows, "opportunities");
  const stageCounts = pick<StageCountsSnapshot>(rows, "stageCounts");
  const calls = pick<CallsSnapshot>(rows, "calls");

  const liveStage = (pipelineId: string, stageId: string) =>
    pipelines.data?.pipelines.find((p) => p.id === pipelineId)?.stages.find((s) => s.id === stageId);
  const livePipeline = (pipelineId: string) => pipelines.data?.pipelines.find((p) => p.id === pipelineId);
  const stageCount = (stageId: string) => stageCounts.data?.stages.find((s) => s.stageId === stageId);
  const userName = (id: string) => users.data?.users.find((u) => u.id === id)?.name ?? id;

  const reportingHint = /fy|fiscal|semester|session|program|branch|army|veteran|cohort|term|enroll/i;

  const openItems: string[] = [];
  for (const m of mappingConfig.milestones) {
    if (m.reportingGroupBasis === "unverified") {
      openItems.push(`${m.label}: the stage name carries no fiscal year, so the ${m.reportingGroup} grouping rule is unverified. Need the field, tag, or rule that says which fiscal year a contact belongs to.`);
    }
  }
  openItems.push("Historical stage changes are not available from the GHL API (only each opportunity's latest stage-change time). Milestone achievements will be tracked from the first dashboard sync forward; earlier stage entries are baseline, not new submissions.");
  if (appts.data && appts.data.fieldPresence.createdBy === 0 && appts.data.totalEvents > 0) {
    openItems.push("Appointments do not expose who created the booking, so \"Booked by\" credit cannot be shown reliably. Rep credit will use the appointment's assigned user, labeled as such.");
  }
  if (calls.data && calls.data.sampled > 0 && calls.data.withUserId < calls.data.sampled) {
    openItems.push(`${calls.data.sampled - calls.data.withUserId} of ${calls.data.sampled} sampled calls have no user attached. Those will sit in an explicit "unattributed" bucket.`);
  }
  if (calls.data && calls.data.sampled > 0 && calls.data.withDuration === 0) {
    openItems.push("The call export carries no call status or duration on the sampled calls. Talk time and answered/no-answer outcomes need another source before they can be reported; until then the call card can show attempts only, labeled as such.");
  }
  if (appts.data && appts.data.totalEvents > 0 && appts.data.fieldPresence.masterEventId === 0) {
    openItems.push("No appointment in the window carries a reschedule link (masterEventId), so a rescheduled appointment cannot be tied to its original booking from this data. The dashboard will disclose that limitation rather than guess.");
  }

  return (
    <>
      <h1>Mapping</h1>
      <p className="lead">
        What the connected Go High Level account contains, how the dashboard&apos;s labels map onto it, and what the
        read-only token is allowed to see. All times shown in {TZ}.
      </p>

      <div className="status-bar">
        <span>
          <b>Last successful sync:</b> {lastOk ? when(lastOk.finished_at) : "never"}
        </span>
        {lastRun ? (
          <span>
            <b>Last attempt:</b> {when(lastRun.finished_at ?? lastRun.started_at)}{" "}
            {lastRun.ok === 1 ? (
              <span className="pill pill-ok">complete</span>
            ) : lastRun.ok === 0 ? (
              <span className="pill pill-warn">partial</span>
            ) : (
              <span className="pill pill-info">running</span>
            )}
          </span>
        ) : null}
        <span>
          <b>Account:</b> {location.data?.name ?? "unavailable"}
        </span>
        <span>
          <b>Account timezone:</b> {location.data?.timezone ?? "unavailable"}
          {location.data?.timezone && location.data.timezone !== TZ ? (
            <span className="pill pill-warn" style={{ marginLeft: 6 }}>
              differs from reporting timezone {TZ}
            </span>
          ) : null}
        </span>
        <RefreshButton />
      </div>

      {lastRun && lastRun.ok === 0 ? (
        <div className="callout callout-warn">
          The last sync did not fully succeed: {lastRun.summary}. Sections below that depend on a failed check show
          &quot;unavailable&quot; rather than partial numbers.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="callout callout-info">No sync has run yet. Click &quot;Sync from GHL now&quot; to read the account.</div>
      ) : null}

      {/* ---- Endpoint access ---- */}
      <section className="card">
        <h2>What the token can read</h2>
        <p className="note">
          Each row is one read-only check against GHL. &quot;Permission denied&quot; means the private integration token
          lacks that scope; nothing here tries to write.
        </p>
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Result</th>
              <th>Checked</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>
                  <ProbePill row={r} />
                </td>
                <td>{when(r.fetched_at)}</td>
                <td className="mono">{r.ok ? (r.status ? `HTTP ${r.status}` : "computed") : r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---- Program mapping ---- */}
      <section className="card">
        <h2>Program milestones → pipeline stages</h2>
        <p className="note">
          From <span className="mono">config/ghl-mapping.json</span>. &quot;Currently in stage&quot; is a snapshot of
          opportunities sitting in that stage right now across all statuses. It is not a count of submissions during a
          period; that event-based count starts once milestone tracking is running.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Dashboard label</th>
                <th>Program</th>
                <th>Pipeline stage (live name)</th>
                <th>Config ↔ live</th>
                <th>Reporting group</th>
                <th className="num">Currently in stage</th>
                <th className="num">…of which status = won</th>
              </tr>
            </thead>
            <tbody>
              {mappingConfig.milestones.map((m) => {
                const live = liveStage(m.pipelineId, m.stageId);
                const sc = stageCount(m.stageId);
                const matches = live ? live.name === m.stageName : undefined;
                return (
                  <tr key={m.key}>
                    <td>
                      <b>{m.label}</b>
                      {m.note ? <div className="note">{m.note}</div> : null}
                    </td>
                    <td>{mappingConfig.programs[m.program].label}</td>
                    <td>
                      {live?.name ?? m.stageName}
                      <div className="mono">{m.stageId}</div>
                    </td>
                    <td>
                      {matches === undefined ? (
                        <span className="pill pill-info">live data unavailable</span>
                      ) : matches ? (
                        <span className="pill pill-ok">matches</span>
                      ) : (
                        <span className="pill pill-bad">stage renamed: config says &quot;{m.stageName}&quot;</span>
                      )}
                      {pipelines.data && !live ? <span className="pill pill-bad">stage not found in GHL</span> : null}
                    </td>
                    <td>
                      {m.reportingGroup}{" "}
                      {m.reportingGroupBasis === "stage_name" ? (
                        <span className="pill pill-ok">from stage name</span>
                      ) : (
                        <span className="pill pill-warn">rule unverified</span>
                      )}
                    </td>
                    <td className="num">{sc ? num(sc.totalAll) : "unavailable"}</td>
                    <td className="num">{sc ? num(sc.totalWon) : "unavailable"}</td>
                  </tr>
                );
              })}
              {mappingConfig.funnelOnlyStages.map((s) => {
                const live = liveStage(s.pipelineId, s.stageId);
                const sc = stageCount(s.stageId);
                return (
                  <tr key={s.stageId}>
                    <td>
                      <span className="pill pill-gold">funnel only</span> {s.stageName}
                      {s.note ? <div className="note">{s.note}</div> : null}
                    </td>
                    <td>{mappingConfig.programs[s.program].label}</td>
                    <td>
                      {live?.name ?? s.stageName}
                      <div className="mono">{s.stageId}</div>
                    </td>
                    <td>
                      {live ? (
                        live.name === s.stageName ? (
                          <span className="pill pill-ok">matches</span>
                        ) : (
                          <span className="pill pill-bad">stage renamed</span>
                        )
                      ) : (
                        <span className="pill pill-info">live data unavailable</span>
                      )}
                    </td>
                    <td>{s.reportingGroup}</td>
                    <td className="num">{sc ? num(sc.totalAll) : "unavailable"}</td>
                    <td className="num">{sc ? num(sc.totalWon) : "unavailable"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h3>Pipeline roles</h3>
        <table>
          <thead>
            <tr>
              <th>Pipeline</th>
              <th>Role</th>
              <th>Used in</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(mappingConfig.programs) as [string, { label: string; pipelineId: string; pipelineName: string }][]).map(([key, p]) => (
              <tr key={key}>
                <td>
                  {livePipeline(p.pipelineId)?.name ?? p.pipelineName}
                  <div className="mono">{p.pipelineId}</div>
                </td>
                <td>
                  <span className="pill pill-ok">program: {p.label}</span>
                </td>
                <td>Program scorecard, milestone cards, leaderboard, Entire CRM won total</td>
              </tr>
            ))}
            {mappingConfig.nonProgramPipelines.map((p) => (
              <tr key={p.pipelineId}>
                <td>
                  {livePipeline(p.pipelineId)?.name ?? p.pipelineName}
                  <div className="mono">{p.pipelineId}</div>
                </td>
                <td>
                  <span className="pill pill-warn">not a program pipeline</span>
                </td>
                <td>
                  Entire CRM won total only (labeled). Excluded from Army and Veteran scorecards.
                  {p.decision ? <div className="note">Decision: {p.decision}</div> : null}
                </td>
              </tr>
            ))}
            {pipelines.data?.pipelines
              .filter(
                (lp) =>
                  !Object.values(mappingConfig.programs).some((p) => p.pipelineId === lp.id) &&
                  !mappingConfig.nonProgramPipelines.some((p) => p.pipelineId === lp.id),
              )
              .map((lp) => (
                <tr key={lp.id}>
                  <td>
                    {lp.name}
                    <div className="mono">{lp.id}</div>
                  </td>
                  <td>
                    <span className="pill pill-bad">new pipeline, not in config</span>
                  </td>
                  <td>Needs a decision: program, non-program, or ignore.</td>
                </tr>
              ))}
          </tbody>
        </table>

        <h3>Reporting groups</h3>
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Program</th>
              <th>Label</th>
              <th>Status</th>
              <th>Stages</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(mappingConfig.reportingGroups).map(([key, g]) => (
              <tr key={key}>
                <td>
                  <b>{key}</b>
                </td>
                <td>{mappingConfig.programs[g.program].label}</td>
                <td>{g.label}</td>
                <td>
                  <span className={`pill ${g.status === "active" ? "pill-ok" : "pill-info"}`}>{g.status}</span>
                </td>
                <td>
                  {g.stages
                    ? g.stages.map((s) => s.stageName).join(", ")
                    : mappingConfig.milestones
                        .filter((m) => m.reportingGroup === key)
                        .map((m) => m.stageName)
                        .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          Won rule: {mappingConfig.wonRule} Dollar amounts are labeled &quot;{mappingConfig.valueLabel}&quot;.
        </p>
      </section>

      {/* ---- Pipelines and stages ---- */}
      <section className="card">
        <h2>Pipelines and stages (live)</h2>
        {pipelines.data ? (
          <div className="grid-2">
            {pipelines.data.pipelines.map((p) => (
              <div key={p.id}>
                <h3>
                  {p.name} <span className="note">({p.stages.length} stages)</span>
                </h3>
                <div className="mono">{p.id}</div>
                <table>
                  <tbody>
                    {p.stages.map((s, i) => {
                      const m = milestoneForStage(s.id);
                      const f = funnelOnlyForStage(s.id);
                      return (
                        <tr key={s.id}>
                          <td className="num" style={{ width: 36 }}>
                            {s.position ?? i + 1}
                          </td>
                          <td>
                            {s.name}
                            <div className="mono">{s.id}</div>
                          </td>
                          <td>
                            {m ? <span className="pill pill-ok">{m.label}</span> : null}
                            {f ? <span className="pill pill-gold">funnel only</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <Unavailable row={pipelines.row} what="Pipelines" />
        )}
      </section>

      {/* ---- Users ---- */}
      <section className="card">
        <h2>Users (team members)</h2>
        {users.data ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {users.data.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name || "(no name)"}</td>
                  <td>{u.email ?? ""}</td>
                  <td>{[u.type, u.role].filter(Boolean).join(" / ")}</td>
                  <td>{u.deleted ? <span className="pill pill-bad">deleted</span> : <span className="pill pill-ok">active</span>}</td>
                  <td className="mono">{u.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Unavailable row={users.row} what="Users" />
        )}
      </section>

      {/* ---- Tags ---- */}
      <section className="card">
        <h2>Contact tags ({tags.data ? tags.data.tags.length : "unavailable"})</h2>
        <p className="note">
          The brief needs tag mappings for Army vs Veteran classification and for lead-source filters. Pick those from
          this list. Highlighted tags look like fiscal-year, semester, program, or branch markers (name match only).
        </p>
        {tags.data ? (
          <div className="chips">
            {[...tags.data.tags]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <span key={t.id} className={reportingHint.test(t.name) ? "chip chip-hint" : "chip"} title={t.id}>
                  {t.name}
                </span>
              ))}
          </div>
        ) : (
          <Unavailable row={tags.row} what="Tags" />
        )}
      </section>

      {/* ---- Custom fields ---- */}
      <section className="card">
        <h2>Custom fields</h2>
        <p className="note">
          Fields that might carry fiscal year, semester, program, or branch are flagged as candidates for the reporting
          group rule. Flagging is a name match only; nothing has been verified.
        </p>
        {fields.data ? (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>On</th>
                  <th>Type</th>
                  <th>Key</th>
                  <th>Options</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...fields.data.fields]
                  .sort((a, b) => (a.model ?? "").localeCompare(b.model ?? "") || a.name.localeCompare(b.name))
                  .map((f) => (
                    <tr key={f.id}>
                      <td>{f.name}</td>
                      <td>{f.model ?? ""}</td>
                      <td>{f.dataType ?? ""}</td>
                      <td className="mono">{f.fieldKey ?? f.id}</td>
                      <td className="note">{f.options?.join(", ") ?? ""}</td>
                      <td>{reportingHint.test(f.name) ? <span className="pill pill-warn">reporting-group candidate</span> : null}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Unavailable row={fields.row} what="Custom fields" />
        )}
      </section>

      {/* ---- Calendars + appointments ---- */}
      <section className="card">
        <h2>Calendars and appointment statuses</h2>
        {calendars.data ? (
          <table>
            <thead>
              <tr>
                <th>Calendar</th>
                <th>Active</th>
                <th>Type</th>
                <th>Team members</th>
                <th className="num">Events in window</th>
              </tr>
            </thead>
            <tbody>
              {calendars.data.calendars.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name}
                    <div className="mono">{c.id}</div>
                  </td>
                  <td>{c.isActive === false ? <span className="pill pill-warn">inactive</span> : <span className="pill pill-ok">active</span>}</td>
                  <td>{[c.calendarType, c.eventType].filter(Boolean).join(" / ")}</td>
                  <td className="note">{c.teamMemberIds.map(userName).join(", ")}</td>
                  <td className="num">{num(appts.data?.byCalendar.find((b) => b.id === c.id)?.count ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Unavailable row={calendars.row} what="Calendars" />
        )}

        {appts.data ? (
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div>
              <CountTable title={`Appointment status values in use (${num(appts.data.totalEvents)} events)`} map={appts.data.byStatus} />
              <p className="note">
                Window: {day(appts.data.windowStart)} to {day(appts.data.windowEnd)} (90 days back, 30 forward). &quot;Completed&quot;
                in the dashboard will mean an explicit showed status, never a past start time.
              </p>
              {appts.data.calendarsFailed.length > 0 ? (
                <div className="callout callout-warn">
                  {appts.data.calendarsFailed.length} calendar(s) could not be read:{" "}
                  {appts.data.calendarsFailed.map((c) => `${c.name} (${c.error})`).join("; ")}
                </div>
              ) : null}
            </div>
            <div>
              <h3>Appointment fields present</h3>
              <table>
                <tbody>
                  <tr>
                    <td>Assigned user (host)</td>
                    <td className="num">{pct(appts.data.fieldPresence.assignedUserId, appts.data.totalEvents)}</td>
                  </tr>
                  <tr>
                    <td>Created by (booker)</td>
                    <td className="num">{pct(appts.data.fieldPresence.createdBy, appts.data.totalEvents)}</td>
                  </tr>
                  <tr>
                    <td>Booking timestamp (dateAdded)</td>
                    <td className="num">{pct(appts.data.fieldPresence.dateAdded, appts.data.totalEvents)}</td>
                  </tr>
                  <tr>
                    <td>Linked contact</td>
                    <td className="num">{pct(appts.data.fieldPresence.contactId, appts.data.totalEvents)}</td>
                  </tr>
                  <tr>
                    <td>Reschedule link (masterEventId)</td>
                    <td className="num">{pct(appts.data.fieldPresence.masterEventId, appts.data.totalEvents)}</td>
                  </tr>
                  <tr>
                    <td>Earliest start in window</td>
                    <td className="num">{day(appts.data.earliestStart)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Unavailable row={appts.row} what="Appointment statuses" />
        )}
      </section>

      {/* ---- Opportunities ---- */}
      <section className="card">
        <h2>Opportunities: totals, value coverage, history</h2>
        <p className="note">
          Totals come from GHL&apos;s own counts. &quot;Sample&quot; columns look at the first 100 opportunities per pipeline to
          see which fields are actually populated. Dollar figures are not shown here; this only checks whether the
          Opportunity Value field is filled in.
        </p>
        {opps.data ? (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Pipeline</th>
                  <th className="num">All</th>
                  <th className="num">Open</th>
                  <th className="num">Won</th>
                  <th className="num">Lost</th>
                  <th className="num">Abandoned</th>
                  <th className="num">Sample</th>
                  <th className="num">Value &gt; 0</th>
                  <th className="num">Value = 0</th>
                  <th className="num">Value missing</th>
                  <th className="num">Has owner</th>
                  <th className="num">Has stage-change time</th>
                  <th>Earliest created</th>
                </tr>
              </thead>
              <tbody>
                {opps.data.pipelines.map((p) => (
                  <tr key={p.pipelineId}>
                    <td>
                      {p.pipelineName}
                      {p.byStatusError ? <div className="callout callout-bad mono">{p.byStatusError}</div> : null}
                    </td>
                    <td className="num">{num(p.totalAll)}</td>
                    <td className="num">{num(p.byStatus.open)}</td>
                    <td className="num">{num(p.byStatus.won)}</td>
                    <td className="num">{num(p.byStatus.lost)}</td>
                    <td className="num">{num(p.byStatus.abandoned)}</td>
                    <td className="num">{num(p.sampleSize)}</td>
                    <td className="num">{num(p.sample.withValue)}</td>
                    <td className="num">{num(p.sample.zeroValue)}</td>
                    <td className="num">{num(p.sample.missingValue)}</td>
                    <td className="num">{num(p.sample.withAssignedTo)}</td>
                    <td className="num">{num(p.sample.withLastStageChangeAt)}</td>
                    <td>
                      {p.earliestCreatedAt ? day(p.earliestCreatedAt) : <span className="note">unavailable{p.earliestError ? ` (${p.earliestError})` : ""}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Unavailable row={opps.row} what="Opportunity totals" />
        )}
        <p className="note" style={{ marginTop: 10 }}>
          Contacts in account: {contacts.data ? num(contacts.data.total) : "unavailable"}{" "}
          {contacts.row && !contacts.row.ok ? <span className="mono">({contacts.row.error})</span> : null}
        </p>
      </section>

      {/* ---- Calls ---- */}
      <section className="card">
        <h2>Call records: fields in use</h2>
        {calls.data ? (
          <>
            <p className="note">
              {calls.data.dateFilterApplied
                ? `Window: ${day(calls.data.windowStart)} to ${day(calls.data.windowEnd)} (last 30 days).`
                : calls.data.dateFilterNote}{" "}
              GHL reports {calls.data.total !== undefined ? num(calls.data.total) : "an unknown number of"} call records in scope; the
              field checks below use the most recent {num(calls.data.sampled)}.
            </p>
            <div className="grid-2">
              <div>
                <CountTable title="Direction" map={calls.data.byDirection} />
                <CountTable title="Call status (meta.callStatus)" map={calls.data.byCallStatus} />
              </div>
              <div>
                <CountTable title="Message type" map={calls.data.byMessageType} />
                <CountTable title="Source" map={calls.data.bySource} />
                <h3>Attribution and duration</h3>
                <table>
                  <tbody>
                    <tr>
                      <td>Calls with a user attached</td>
                      <td className="num">{pct(calls.data.withUserId, calls.data.sampled)}</td>
                    </tr>
                    <tr>
                      <td>Calls with a duration &gt; 0</td>
                      <td className="num">{pct(calls.data.withDuration, calls.data.sampled)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="note">
                  Talk time will count only calls whose status is a human answer. Voicemail and automated call types stay
                  out of the human-rep numbers.
                </p>
              </div>
            </div>
          </>
        ) : (
          <Unavailable row={calls.row} what="Call records" />
        )}
      </section>

      {/* ---- History coverage + open items ---- */}
      <section className="card">
        <h2>History coverage and open items</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Available from</th>
              <th>Basis</th>
            </tr>
          </thead>
          <tbody>
            {opps.data?.pipelines.map((p) => (
              <tr key={p.pipelineId}>
                <td>Opportunities: {p.pipelineName}</td>
                <td>{p.earliestCreatedAt ? day(p.earliestCreatedAt) : "unavailable"}</td>
                <td className="note">Opportunity created date. Stage-change history before the first dashboard sync is not available.</td>
              </tr>
            ))}
            <tr>
              <td>Milestone achievements (event-based)</td>
              <td>{lastOk ? day(lastOk.finished_at) : "not started"}</td>
              <td className="note">Reliable activity tracking begins at the first successful milestone sync. Not yet running.</td>
            </tr>
            <tr>
              <td>Appointments</td>
              <td>{appts.data ? `at least ${day(appts.data.earliestStart)} (checked 90 days back)` : "unavailable"}</td>
              <td className="note">Calendar events by start time; a wider check comes with the appointments sync.</td>
            </tr>
            <tr>
              <td>Calls</td>
              <td>{calls.data ? `at least ${day(calls.data.earliest)} (checked 30 days back)` : "unavailable"}</td>
              <td className="note">Message export by created time.</td>
            </tr>
          </tbody>
        </table>
        <h3>Open items needing a decision or more evidence</h3>
        <ul className="plain">
          {openItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
