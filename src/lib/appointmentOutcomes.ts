// Appointment → outcome cohorts (owner request 2026-10-17, cards 4–6).
//
// Cohort: contacts with an appointment SCHEDULED in the selected range. Each
// contact is anchored to their earliest such appointment, and "since" means
// at or after that appointment's start time, judged as of today (the last
// sync), not as of the end of the range.
//
// Outcomes, first achievement per contact, de-duplicated by contact id:
//   CA 101 / FS2 — milestone_events (GHL's own stage-entry times);
//   NGT          — entries into "Appointment Booked (NGT)" from the stage
//                  history the sync observes every 15 minutes, plus the
//                  GHL stage-entry time of opportunities that were already
//                  in the stage at the first sync and still are;
//   Won / Lost   — opportunity status won / lost with GHL's status-change
//                  time (always available, no history limit).
// Milestone and stage history only exist since the first core sync
// (2026-10-11), so appointments scheduled before that date are reported as
// "history unavailable" for the conversion step and left out of its rate.

import { appointmentsConfig, bookedIn, callsBeforeBooking, emptySplit, iso, scheduledIn, STATUS_LABEL, TAG_CLASS_LABEL, type Appt, type RatesResult, type Split, type TagClass } from "@/lib/appointments";
import { getDb } from "@/lib/db";
import { fmtDay, type DateRange } from "@/lib/dates";
import { contactUrl, type DrillResult, type DrillRow } from "@/lib/drilldown";
import { mappingConfig, trackedMilestones } from "@/lib/mapping-config";
import { classifyTags, coverage } from "@/lib/metrics";
import { userNames } from "@/lib/milestones";
import { repRoster } from "@/lib/reps";

const n = (v: number) => v.toLocaleString("en-US");

// ---- events per contact -----------------------------------------------------------------------

interface Reached {
  label: string;
  at: string;
}

/** Earliest milestone event per contact for the given keys, at or after `since` is decided by the caller. */
function milestoneTimes(keys: string[]): Map<string, { key: string; label: string; at: string }[]> {
  const out = new Map<string, { key: string; label: string; at: string }[]>();
  if (keys.length === 0) return out;
  const labels = new Map(trackedMilestones().map((m) => [m.key, m.stageName]));
  const rows = getDb()
    .prepare(`SELECT contact_id, milestone_key, event_time FROM milestone_events WHERE kind = 'milestone' AND contact_id IS NOT NULL AND milestone_key IN (${keys.map(() => "?").join(",")}) ORDER BY event_time`)
    .all(...keys) as unknown as { contact_id: string; milestone_key: string; event_time: string }[];
  for (const r of rows) out.set(r.contact_id, [...(out.get(r.contact_id) ?? []), { key: r.milestone_key, label: labels.get(r.milestone_key) ?? r.milestone_key, at: r.event_time }]);
  return out;
}

/**
 * Entries into the NGT stage per contact: observed stage changes since the
 * first sync (time = when the sync saw it, within 15 minutes), plus
 * opportunities that were in the stage at the first sync and still are
 * (time = GHL's own stage-entry stamp). An opportunity that was in the stage
 * at the first sync and has since left entered before the history starts and
 * cannot be dated, so it is left out.
 */
export function ngtEntries(): Map<string, { at: string; basis: "observed" | "ghl"; opportunityId: string }[]> {
  const cfg = appointmentsConfig();
  const out = new Map<string, { at: string; basis: "observed" | "ghl"; opportunityId: string }[]>();
  if (!cfg.ngtStage.stageId) return out;
  const add = (c: string, e: { at: string; basis: "observed" | "ghl"; opportunityId: string }) => out.set(c, [...(out.get(c) ?? []), e]);
  const observed = getDb()
    .prepare(
      `SELECT o.contact_id, h.opportunity_id, h.observed_at FROM opportunity_history h JOIN opportunities o ON o.id = h.opportunity_id
        WHERE h.stage_id = ? AND h.change_kind != 'baseline' AND o.contact_id IS NOT NULL ORDER BY h.observed_at`,
    )
    .all(cfg.ngtStage.stageId) as unknown as { contact_id: string; opportunity_id: string; observed_at: string }[];
  for (const r of observed) add(r.contact_id, { at: r.observed_at, basis: "observed", opportunityId: r.opportunity_id });
  const baseline = getDb()
    .prepare(
      `SELECT o.contact_id, o.id, o.last_stage_change_at FROM opportunities o
        WHERE o.stage_id = ? AND o.missing_since IS NULL AND o.contact_id IS NOT NULL AND o.last_stage_change_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM opportunity_history h WHERE h.opportunity_id = o.id AND h.stage_id = ? AND h.change_kind = 'baseline')
          AND NOT EXISTS (SELECT 1 FROM opportunity_history h WHERE h.opportunity_id = o.id AND h.stage_id = ? AND h.change_kind != 'baseline')`,
    )
    .all(cfg.ngtStage.stageId, cfg.ngtStage.stageId, cfg.ngtStage.stageId) as unknown as { contact_id: string; id: string; last_stage_change_at: string }[];
  for (const r of baseline) add(r.contact_id, { at: r.last_stage_change_at, basis: "ghl", opportunityId: r.id });
  return out;
}

interface OppStatus {
  id: string;
  status: string;
  at: string | null;
  pipelineId: string;
  stageId: string;
  assignedTo: string | null;
}

/** Every live opportunity per contact with its status and GHL status-change time. */
function oppsByContact(): Map<string, OppStatus[]> {
  const out = new Map<string, OppStatus[]>();
  const rows = getDb()
    .prepare(`SELECT id, contact_id, status, last_status_change_at, pipeline_id, stage_id, assigned_to FROM opportunities WHERE missing_since IS NULL AND contact_id IS NOT NULL`)
    .all() as unknown as { id: string; contact_id: string; status: string; last_status_change_at: string | null; pipeline_id: string; stage_id: string; assigned_to: string | null }[];
  for (const r of rows) out.set(r.contact_id, [...(out.get(r.contact_id) ?? []), { id: r.id, status: r.status, at: r.last_status_change_at, pipelineId: r.pipeline_id, stageId: r.stage_id, assignedTo: r.assigned_to }]);
  return out;
}

/** The earliest opportunity of a contact with the given status whose status changed at or after `since`. */
function statusSince(opps: OppStatus[] | undefined, status: string, since: string): OppStatus | null {
  let best: OppStatus | null = null;
  for (const o of opps ?? []) {
    if (o.status !== status || !o.at || o.at < since) continue;
    if (!best || o.at < (best.at as string)) best = o;
  }
  return best;
}

// ---- 4. appointment → outcome -----------------------------------------------------------------------

export interface CohortMember {
  contactId: string;
  cls: TagClass;
  /** The earliest appointment scheduled in the range for this contact. */
  anchor: Appt;
  appointments: Appt[];
  showed: boolean;
  historyAvailable: boolean;
  ca101: Reached | null;
  fs2: Reached | null;
  ngt: Reached | null;
  /** First of the three outcomes reached, if any. */
  converted: Reached | null;
  won: Reached | null;
  lost: (Reached & { opp: OppStatus }) | null;
}

export interface OutcomeResult {
  members: CohortMember[];
  cohort: Split;
  withHistory: Split;
  historyUnavailable: Split;
  showed: Split;
  ca101: Split;
  fs2: Split;
  ngt: Split;
  converted: Split;
  won: Split;
  lost: Split;
  /** Of the cohort with history, the share that converted. */
  conversionRate: { army: number | null; veteran: number | null; total: number | null };
  wonRate: { army: number | null; veteran: number | null; total: number | null };
  historyStart: string | undefined;
  asOf: string;
  ngtStageName: string;
  notes: string[];
}

const EMPTY_RATE = { army: null, veteran: null, total: null };

function rate(num: Split, den: Split): { army: number | null; veteran: number | null; total: number | null } {
  const r = (a: number, b: number) => (b > 0 ? a / b : null);
  return { army: r(num.army, den.army), veteran: r(num.veteran, den.veteran), total: r(num.total, den.total) };
}

export function buildCohort(range: DateRange): CohortMember[] {
  const cfg = appointmentsConfig();
  const historyStart = coverage().firstCoreSyncAt;
  const scheduled = scheduledIn(iso(range.start), iso(range.end)).filter((a) => a.contactId);
  scheduled.sort((a, b) => ((a.startTime ?? "") < (b.startTime ?? "") ? -1 : 1));
  const byContact = new Map<string, Appt[]>();
  for (const a of scheduled) byContact.set(a.contactId as string, [...(byContact.get(a.contactId as string) ?? []), a]);
  const milestones = milestoneTimes(cfg.outcomeMilestones);
  const ngt = ngtEntries();
  const opps = oppsByContact();
  const ca101Key = cfg.outcomeMilestones[0];
  const fs2Key = cfg.outcomeMilestones[1];

  const members: CohortMember[] = [];
  for (const [contactId, appts] of byContact) {
    const anchor = appts[0];
    const since = anchor.startTime ?? "";
    const firstOf = (key: string | undefined): Reached | null => {
      if (!key) return null;
      const hit = (milestones.get(contactId) ?? []).find((e) => e.key === key && e.at >= since);
      return hit ? { label: hit.label, at: hit.at } : null;
    };
    const ca101 = firstOf(ca101Key);
    const fs2 = firstOf(fs2Key);
    const ngtHit = (ngt.get(contactId) ?? []).find((e) => e.at >= since);
    const ngtReached = ngtHit ? { label: cfg.ngtStage.stageName, at: ngtHit.at } : null;
    const converted = [ca101, fs2, ngtReached].filter((x): x is Reached => x !== null).sort((a, b) => (a.at < b.at ? -1 : 1))[0] ?? null;
    const wonOpp = statusSince(opps.get(contactId), "won", since);
    const lostOpp = statusSince(opps.get(contactId), "lost", since);
    members.push({
      contactId,
      cls: anchor.cls,
      anchor,
      appointments: appts,
      showed: appts.some((a) => a.status === "showed"),
      historyAvailable: Boolean(historyStart) && since >= (historyStart as string),
      ca101,
      fs2,
      ngt: ngtReached,
      converted,
      won: wonOpp ? { label: "Won", at: wonOpp.at as string } : null,
      lost: lostOpp ? { label: "Lost", at: lostOpp.at as string, opp: lostOpp } : null,
    });
  }
  return members;
}

function splitWhere(members: CohortMember[], f: (m: CohortMember) => boolean): Split {
  const s = emptySplit();
  for (const m of members) {
    if (!f(m)) continue;
    s[m.cls] += 1;
    s.total += 1;
  }
  return s;
}

export function computeOutcome(range: DateRange): OutcomeResult {
  const cfg = appointmentsConfig();
  const members = buildCohort(range);
  const hist = (m: CohortMember) => m.historyAvailable;
  const cohort = splitWhere(members, () => true);
  const withHistory = splitWhere(members, hist);
  const converted = splitWhere(members, (m) => hist(m) && m.converted !== null);
  const won = splitWhere(members, (m) => m.won !== null);
  const historyStart = coverage().firstCoreSyncAt;
  const asOf = coverage().lastCoreSyncOkAt ?? new Date().toISOString();
  return {
    members,
    cohort,
    withHistory,
    historyUnavailable: splitWhere(members, (m) => !hist(m)),
    showed: splitWhere(members, (m) => m.showed),
    ca101: splitWhere(members, (m) => hist(m) && m.ca101 !== null),
    fs2: splitWhere(members, (m) => hist(m) && m.fs2 !== null),
    ngt: splitWhere(members, (m) => hist(m) && m.ngt !== null),
    converted,
    won,
    lost: splitWhere(members, (m) => m.lost !== null),
    conversionRate: withHistory.total > 0 ? rate(converted, withHistory) : EMPTY_RATE,
    wonRate: cohort.total > 0 ? rate(won, cohort) : EMPTY_RATE,
    historyStart,
    asOf,
    ngtStageName: cfg.ngtStage.stageName,
    notes: [
      "Cohort — distinct contacts (by contact ID) with an appointment scheduled to start in the selected range, any calendar status; each contact is anchored to their earliest such appointment.",
      `As of — outcomes are judged as of the last sync (${fmtDay(new Date(asOf))}), not as of the end of the range, so a cohort keeps converting after its period ends.`,
      "Since — an outcome counts when it happened at or after the anchor appointment's start time; the first achievement per contact is used and a contact counts once per outcome.",
      "CA 101 submitted / IAU App Submitted (FS2) — the contact's first entry into the stage, from the milestone events with GHL's own stage-entry time.",
      `${cfg.ngtStage.stageName} — entry into the stage, read from the stage history the sync observes every 15 minutes (time = when the sync saw it), or GHL's stage-entry time for opportunities already in the stage at the first sync.`,
      "Converted — reached any of the three outcomes (CA 101, FS2, NGT); counts and the % use only cohort contacts whose appointment falls after the history start.",
      "Won / Lost — the contact has an opportunity whose status is won / lost with GHL's status-change time at or after the appointment; always available, no history limit. Each funnel step counts cohort contacts on its own (a no-show can still convert), so steps are not strictly nested.",
      "Army / Veteran — the contact's current tags; Both and No tag count in Total only.",
      `Limitation: milestone and stage history only exist since the first sync (${historyStart ? fmtDay(new Date(historyStart)) : "not yet"}), so contacts whose appointment was before that date show "history unavailable" for the conversion step and are excluded from the conversion %.`,
    ],
  };
}

// ---- 5. post-appointment losses + NGT follow-up ------------------------------------------------------------

export interface NgtMember {
  contactId: string;
  cls: TagClass;
  enteredAt: string;
  basis: "observed" | "ghl";
  opportunityId: string;
  fs2: Reached | null;
  won: Reached | null;
  lost: (Reached & { opp: OppStatus }) | null;
}

export interface LossesResult {
  /** Contacts with a Showed appointment scheduled in the range. */
  showedContacts: Split;
  /** Of those, contacts with an opportunity lost at or after the appointment. */
  lostAfterShowed: Split;
  lostMembers: CohortMember[];
  /** By the stage the opportunity was lost from (its current stage). */
  lostByStage: { stage: string; pipeline: string; count: number }[];
  ngt: { entered: Split; fs2: Split; won: Split; lost: Split; open: Split; members: NgtMember[]; stageName: string };
  notes: string[];
}

function stageNames() {
  const stages = new Map<string, string>();
  const pipelines = new Map<string, string>();
  for (const p of mappingConfig.pipelines) {
    pipelines.set(p.id, p.name);
    for (const s of p.stages) stages.set(s.id, s.name);
  }
  return { stages, pipelines };
}

export function buildNgt(range: DateRange): NgtMember[] {
  const cfg = appointmentsConfig();
  const start = iso(range.start);
  const end = iso(range.end);
  const entries = ngtEntries();
  const milestones = milestoneTimes(cfg.outcomeMilestones.slice(1, 2));
  const opps = oppsByContact();
  const tags = new Map<string, string | null>();
  const ids = [...entries.keys()];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const c of getDb().prepare(`SELECT id, tags FROM contacts WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; tags: string | null }[]) tags.set(c.id, c.tags);
  }
  const members: NgtMember[] = [];
  for (const [contactId, list] of entries) {
    const inRange = list.filter((e) => e.at >= start && e.at < end).sort((a, b) => (a.at < b.at ? -1 : 1))[0];
    if (!inRange) continue;
    const since = inRange.at;
    const fs2Hit = (milestones.get(contactId) ?? []).find((e) => e.at >= since);
    const wonOpp = statusSince(opps.get(contactId), "won", since);
    const lostOpp = statusSince(opps.get(contactId), "lost", since);
    members.push({
      contactId,
      cls: classifyTags(tags.get(contactId) ?? null),
      enteredAt: since,
      basis: inRange.basis,
      opportunityId: inRange.opportunityId,
      fs2: fs2Hit ? { label: fs2Hit.label, at: fs2Hit.at } : null,
      won: wonOpp ? { label: "Won", at: wonOpp.at as string } : null,
      lost: lostOpp ? { label: "Lost", at: lostOpp.at as string, opp: lostOpp } : null,
    });
  }
  return members;
}

export function computeLosses(range: DateRange, outcome: OutcomeResult): LossesResult {
  const cfg = appointmentsConfig();
  const { stages, pipelines } = stageNames();
  const showedMembers = outcome.members.filter((m) => m.showed);
  // lost at or after the showed appointment (the earliest showed appointment of the contact in the range)
  const lostMembers = showedMembers.filter((m) => {
    const showedAt = m.appointments.find((a) => a.status === "showed")?.startTime ?? m.anchor.startTime ?? "";
    return m.lost !== null && m.lost.at >= showedAt;
  });
  const byStage = new Map<string, { stage: string; pipeline: string; count: number }>();
  for (const m of lostMembers) {
    const o = (m.lost as NonNullable<CohortMember["lost"]>).opp;
    const key = `${o.pipelineId}:${o.stageId}`;
    const cur = byStage.get(key) ?? { stage: stages.get(o.stageId) ?? o.stageId, pipeline: pipelines.get(o.pipelineId) ?? o.pipelineId, count: 0 };
    cur.count += 1;
    byStage.set(key, cur);
  }
  const ngtMembers = buildNgt(range);
  const ngtSplit = (f: (m: NgtMember) => boolean): Split => {
    const s = emptySplit();
    for (const m of ngtMembers) {
      if (!f(m)) continue;
      s[m.cls] += 1;
      s.total += 1;
    }
    return s;
  };
  const historyStart = coverage().firstCoreSyncAt;
  return {
    showedContacts: splitWhere(showedMembers, () => true),
    lostAfterShowed: splitWhere(lostMembers, () => true),
    lostMembers,
    lostByStage: [...byStage.values()].sort((a, b) => b.count - a.count),
    ngt: {
      entered: ngtSplit(() => true),
      fs2: ngtSplit((m) => m.fs2 !== null),
      won: ngtSplit((m) => m.won !== null),
      lost: ngtSplit((m) => m.lost !== null),
      open: ngtSplit((m) => m.fs2 === null && m.won === null && m.lost === null),
      members: ngtMembers,
      stageName: cfg.ngtStage.stageName,
    },
    notes: [
      "Showed contacts — distinct contacts with an appointment scheduled in the range and marked Showed.",
      "Lost after showing — of those, contacts with an opportunity whose status is lost and whose GHL status-change time is at or after the showed appointment's start; the stage shown is the stage the opportunity sits in now, which is where it was lost from (GHL keeps the stage when an opportunity is marked lost).",
      `${cfg.ngtStage.stageName} entries — contacts whose opportunity entered the stage during the range: stage changes the sync observed (time = when it was seen, within 15 minutes), plus opportunities already in the stage at the first sync and still there (GHL's own stage-entry time).`,
      "Since became — IAU App Submitted (FS2) from the milestone events, won / lost from the opportunity status with GHL's status-change time, each at or after the NGT entry; a contact can appear under more than one. Still open = none of the three.",
      "Army / Veteran — the contact's current tags; Both and No tag count in Total only.",
      `Limitation: stage history exists only since the first sync (${historyStart ? fmtDay(new Date(historyStart)) : "not yet"}); an opportunity that entered and left the NGT stage before then cannot be dated and is not counted.`,
    ],
  };
}

// ---- 6. Army vs Veteran ---------------------------------------------------------------------------

export interface CompareLine {
  key: string;
  label: string;
  army: number | null;
  veteran: number | null;
  /** How to show the value. */
  format: "pct" | "calls";
  lowerIsBetter: boolean;
  better: "army" | "veteran" | "tie" | null;
  /** Gap in percentage points (pct) or calls. */
  gap: number | null;
  basis: string;
  /** Numerators and denominators for the title. */
  detail: { army: string; veteran: string };
}

export interface CompareResult {
  lines: CompareLine[];
  notes: string[];
}

export function computeComparison(range: DateRange, rates: RatesResult, outcome: OutcomeResult): CompareResult {
  const cfg = appointmentsConfig();
  const roster = repRoster();
  const isRep = (u: string | null) => u !== null && roster.byUserId.has(u);
  // calls per booking by program: host dials in the window before each booking created in the range
  const booked = bookedIn(iso(range.start), iso(range.end));
  const dialRows = getDb()
    .prepare(
      `SELECT MIN(NULLIF(user_id, '')) AS u, MIN(date_added) AS t, MIN(contact_id) AS cid FROM calls
        WHERE automated = 0 AND direction = 'outbound' AND contact_id IS NOT NULL AND date_added >= ? AND date_added < ? GROUP BY COALESCE(alt_id, id)`,
    )
    .all(new Date(range.start.getTime() - cfg.callsBeforeBookingDays * 86400000).toISOString(), iso(range.end)) as unknown as { u: string | null; t: string; cid: string }[];
  const dials = new Map<string, { u: string | null; t: string }[]>();
  for (const r of dialRows) dials.set(r.cid, [...(dials.get(r.cid) ?? []), { u: r.u, t: r.t }]);
  const cpb = { army: { calls: 0, bookings: 0 }, veteran: { calls: 0, bookings: 0 } };
  for (const a of booked) {
    if (a.cls !== "army" && a.cls !== "veteran") continue;
    cpb[a.cls].bookings += 1;
    cpb[a.cls].calls += callsBeforeBooking(dials, a, cfg.callsBeforeBookingDays, isRep);
  }

  const line = (key: string, label: string, army: { num: number; den: number }, veteran: { num: number; den: number }, format: "pct" | "calls", lowerIsBetter: boolean, basis: string): CompareLine => {
    const av = army.den > 0 ? army.num / army.den : null;
    const vv = veteran.den > 0 ? veteran.num / veteran.den : null;
    let better: CompareLine["better"] = null;
    let gap: number | null = null;
    if (av !== null && vv !== null) {
      const diff = format === "pct" ? (av - vv) * 100 : av - vv;
      gap = Math.abs(diff);
      better = Math.abs(diff) < (format === "pct" ? 0.05 : 0.005) ? "tie" : (diff > 0) !== lowerIsBetter ? "army" : "veteran";
    }
    const d = (r: { num: number; den: number }) => (format === "pct" ? `${n(r.num)} / ${n(r.den)}` : `${n(r.num)} dials / ${n(r.den)} bookings`);
    return { key, label, army: av, veteran: vv, format, lowerIsBetter, better, gap, basis, detail: { army: d(army), veteran: d(veteran) } };
  };
  const rl = (k: string) => rates.lines.find((l) => l.key === k);
  const show = rl("showRate");
  const cancel = rl("cancelRate");
  const lines: CompareLine[] = [
    line("showRate", "Show rate", show?.army ?? { num: 0, den: 0 }, show?.veteran ?? { num: 0, den: 0 }, "pct", false, "Showed ÷ (Showed + No-show), scheduled in period"),
    line("cancelRate", "Cancel rate", cancel?.army ?? { num: 0, den: 0 }, cancel?.veteran ?? { num: 0, den: 0 }, "pct", true, "Cancelled ÷ bookings created in period"),
    line("callsPerBooking", "Calls per booking", { num: cpb.army.calls, den: cpb.army.bookings }, { num: cpb.veteran.calls, den: cpb.veteran.bookings }, "calls", true, `Host dials in the ${cfg.callsBeforeBookingDays} days before each booking ÷ bookings created in period`),
    line("conversion", "Appointment → conversion", { num: outcome.converted.army, den: outcome.withHistory.army }, { num: outcome.converted.veteran, den: outcome.withHistory.veteran }, "pct", false, "Converted (CA 101, FS2, or NGT) ÷ cohort contacts with history"),
    line("won", "Appointment → won", { num: outcome.won.army, den: outcome.cohort.army }, { num: outcome.won.veteran, den: outcome.cohort.veteran }, "pct", false, "Won after the appointment ÷ cohort contacts"),
  ];
  return {
    lines,
    notes: [
      "Rows — the same definitions as the Appointment Rates, Rep Appointments, and Appointment → Outcome cards: show and cancel rates from appointments, calls per booking from bookings created in the period, conversion and won from the scheduled-appointment cohort judged as of the last sync.",
      "Better — the higher side for show rate, conversion, and won; the lower side for cancel rate and calls per booking (fewer dials per booking is cheaper). Within 0.05 points is a tie.",
      "Gap — the difference in percentage points, or in calls for calls per booking.",
      "Army / Veteran — the contact's current tags; contacts tagged both or neither are not in either column.",
      "Limitation: conversion uses only cohort contacts whose appointment falls after the history start, so small cohorts swing the gap.",
    ],
  };
}

// ---- drilldowns ---------------------------------------------------------------------------------

function memberRows(members: CohortMember[], segmentsOf: (m: CohortMember) => string[]): DrillRow[] {
  const names = userNames();
  const { stages, pipelines } = stageNames();
  const ids = members.map((m) => m.contactId);
  const contactName = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; name: string | null }[]) contactName.set(c.id, c.name);
  }
  return members.map((m) => {
    const a = m.anchor;
    const outcome = m.converted;
    const status = m.won ? "won" : m.lost ? "lost" : "open";
    return {
      contactId: m.contactId,
      opportunityId: m.lost?.opp.id ?? a.id,
      name: contactName.get(m.contactId) ?? null,
      ghlUrl: contactUrl(m.contactId),
      source: null,
      assignedUser: a.hostId ? (names.get(a.hostId) ?? a.hostId) : null,
      pipeline: m.lost ? (pipelines.get(m.lost.opp.pipelineId) ?? m.lost.opp.pipelineId) : null,
      status: m.historyAvailable ? status : `${status} · history unavailable`,
      phone: null,
      email: null,
      value: null,
      stage: m.lost ? (stages.get(m.lost.opp.stageId) ?? m.lost.opp.stageId) : null,
      stageReached: "cohort",
      milestoneKey: "cohort",
      tags: [],
      createdOn: null,
      reachedOn: a.startTime ?? "",
      tagClass: TAG_CLASS_LABEL[m.cls],
      apptStatus: STATUS_LABEL[a.status] + (m.appointments.length > 1 ? ` (+${m.appointments.length - 1} more in range)` : ""),
      scheduledFor: a.startTime,
      outcomeStage: m.historyAvailable ? (outcome ? outcome.label : null) : "history unavailable",
      outcomeOn: outcome?.at ?? null,
      lostOn: m.lost?.at ?? null,
      segments: segmentsOf(m),
    };
  });
}

/** The appointment → outcome cohort, each contact tagged with every step it reached. Segment counts equal the card. */
export function outcomeDrilldown(range: DateRange): DrillResult {
  const o = computeOutcome(range);
  const rows = memberRows(o.members, (m) => [
    "cohort",
    ...(m.historyAvailable ? ["withHistory"] : ["historyUnavailable"]),
    ...(m.showed ? ["showed"] : []),
    ...(m.historyAvailable && m.ca101 ? ["ca101"] : []),
    ...(m.historyAvailable && m.fs2 ? ["fs2"] : []),
    ...(m.historyAvailable && m.ngt ? ["ngt"] : []),
    ...(m.historyAvailable && m.converted ? ["converted"] : []),
    ...(m.won ? ["won"] : []),
    ...(m.lost ? ["lost"] : []),
  ]);
  rows.sort((a, b) => (a.reachedOn < b.reachedOn ? 1 : a.reachedOn > b.reachedOn ? -1 : 0));
  return { ok: true, title: "Appointment → Outcome cohort", rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}

/** Contacts lost after a showed appointment, with the stage they were lost from. */
export function lostDrilldown(range: DateRange): DrillResult {
  const o = computeOutcome(range);
  const l = computeLosses(range, o);
  const rows = memberRows(l.lostMembers, () => ["lost"]).map((r) => ({ ...r, apptStatus: "Showed" }));
  rows.sort((a, b) => ((a.lostOn ?? "") < (b.lostOn ?? "") ? 1 : -1));
  return { ok: true, title: "Lost after showing", rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}

/** Contacts who entered the NGT stage in the range, tagged with what they became since. */
export function ngtDrilldown(range: DateRange): DrillResult {
  const members = buildNgt(range);
  const names = userNames();
  const { stages, pipelines } = stageNames();
  const opps = oppsByContact();
  const ids = members.map((m) => m.contactId);
  const contactName = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; name: string | null }[]) contactName.set(c.id, c.name);
  }
  const rows: DrillRow[] = members.map((m) => {
    const opp = (opps.get(m.contactId) ?? []).find((o) => o.id === m.opportunityId) ?? null;
    const became = m.won ? m.won : m.lost ? m.lost : m.fs2 ? m.fs2 : null;
    return {
      contactId: m.contactId,
      opportunityId: m.opportunityId,
      name: contactName.get(m.contactId) ?? null,
      ghlUrl: contactUrl(m.contactId),
      source: null,
      assignedUser: opp?.assignedTo ? (names.get(opp.assignedTo) ?? opp.assignedTo) : null,
      pipeline: opp ? (pipelines.get(opp.pipelineId) ?? opp.pipelineId) : null,
      status: opp?.status ?? null,
      phone: null,
      email: null,
      value: null,
      stage: opp ? (stages.get(opp.stageId) ?? opp.stageId) : null,
      stageReached: "ngt",
      milestoneKey: "ngt",
      tags: [],
      createdOn: null,
      reachedOn: m.enteredAt,
      tagClass: TAG_CLASS_LABEL[m.cls],
      apptStatus: m.basis === "observed" ? "entry seen by sync" : "GHL stage-entry time",
      outcomeStage: became ? [m.fs2 ? "IAU App Submitted (FS2)" : null, m.won ? "Won" : null, m.lost ? "Lost" : null].filter(Boolean).join(" + ") : null,
      outcomeOn: became?.at ?? null,
      lostOn: m.lost?.at ?? null,
      segments: ["entered", ...(m.fs2 ? ["fs2"] : []), ...(m.won ? ["won"] : []), ...(m.lost ? ["lost"] : []), ...(!m.fs2 && !m.won && !m.lost ? ["open"] : [])],
    };
  });
  rows.sort((a, b) => (a.reachedOn < b.reachedOn ? 1 : -1));
  return { ok: true, title: "Appointment Booked (NGT) entries", rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}
