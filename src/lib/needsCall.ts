// "Needs a call" (owner request 2026-11-24, round 6): a rep's live leads
// sitting in an active working tier with no outbound call from that rep for
// more than N days. Shared by the rep dashboard (My pipeline card and its
// drilldown), the admin Rep Performance cards (a per-rep count), and the
// midweek check-in (a per-rep flag). Snapshot as of the last sync.
//
// Rule:
//   lead      = an open opportunity assigned to the rep, in one of the
//               configured stages (config/leads.json needsCall.stageNames,
//               matched by name, case-insensitive, in the Army CA and Veteran
//               G.I. Bill pipelines), not missing from GHL;
//   last call = the rep's most recent outbound human call to the contact
//               (one per call id, automated calls excluded: the same
//               call-touch rule the Leads section uses, restricted to the rep);
//   silent    = days since that call, or, when the rep has never called the
//               contact, days since the opportunity entered its current stage
//               (GHL's stage-entry time, else when the dashboard first saw it),
//               so a lead that just arrived in a tier is not flagged;
//   needs a call when silent > needsCall.silentDays.
// Reads the local cache only; nothing here calls or writes GHL.

import { TAG_CLASS_LABEL, type TagClass } from "@/lib/appointments";
import { classifyOutcome, OUTCOME_LABEL, pickStatus } from "@/lib/callOutcomes";
import { getDb } from "@/lib/db";
import { contactUrl, type DrillRow } from "@/lib/drilldown";
import { conversationMinSeconds } from "@/lib/goals";
import { leadsConfig } from "@/lib/leads";
import { mappingConfig, type ProgramKey } from "@/lib/mapping-config";
import { classifyTags } from "@/lib/metrics";
import { activeReps, type Rep } from "@/lib/reps";

export interface NeedsCallStage {
  stageId: string;
  stageName: string;
  pipelineId: string;
  pipelineName: string;
  program: ProgramKey;
}

export interface NeedsCallLead {
  contactId: string | null;
  opportunityId: string;
  name: string;
  ghlUrl: string | null;
  cls: TagClass;
  program: ProgramKey;
  pipeline: string;
  stage: string;
  stageId: string;
  /** The rep's last outbound call to the contact (ISO), or null when never. */
  lastCallAt: string | null;
  lastCallOutcome: string | null;
  /** When the silence started: the last call, or the stage entry when never called. */
  silentSince: string;
  silentBasis: "call" | "stage";
  daysSilent: number;
}

export interface NeedsCallResult {
  total: number;
  army: number;
  veteran: number;
  byStage: { stageId: string; stage: string; pipeline: string; program: ProgramKey; army: number; veteran: number; total: number }[];
  leads: NeedsCallLead[];
  silentDays: number;
  stageNames: string[];
  asOf: string;
  notes: string[];
}

const n = (v: number) => v.toLocaleString("en-US");

/** The configured active stages in the two program pipelines, in pipeline order. */
export function needsCallStages(): NeedsCallStage[] {
  const wanted = new Set(leadsConfig().needsCall.stageNames.map((s) => s.trim().toLowerCase()));
  const out: NeedsCallStage[] = [];
  for (const program of ["army", "veteran"] as ProgramKey[]) {
    const p = mappingConfig.programs[program];
    const def = mappingConfig.pipelines.find((x) => x.id === p.pipelineId);
    if (!def) continue;
    for (const s of [...def.stages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) if (wanted.has(s.name.trim().toLowerCase())) out.push({ stageId: s.id, stageName: s.name, pipelineId: def.id, pipelineName: def.name, program });
  }
  return out;
}

interface OppRow {
  id: string;
  contact_id: string | null;
  name: string | null;
  cname: string | null;
  tags: string | null;
  pipeline_id: string;
  stage_id: string;
  last_stage_change_at: string | null;
  first_seen_at: string;
}

/** The leads of one rep that need a call, longest silent first. */
export function computeNeedsCall(rep: Rep, now: Date): NeedsCallResult {
  const cfg = leadsConfig().needsCall;
  const stages = needsCallStages();
  const byStageId = new Map(stages.map((s) => [s.stageId, s]));
  const asOf = now.toISOString();
  const leads: NeedsCallLead[] = [];
  if (stages.length > 0) {
    const marks = stages.map(() => "?").join(",");
    const opps = getDb()
      .prepare(
        `SELECT o.id, o.contact_id, o.name, c.name AS cname, c.tags, o.pipeline_id, o.stage_id, o.last_stage_change_at, o.first_seen_at
           FROM opportunities o LEFT JOIN contacts c ON c.id = o.contact_id
          WHERE o.assigned_to = ? AND o.status = 'open' AND o.missing_since IS NULL AND o.stage_id IN (${marks})`,
      )
      .all(rep.userId, ...stages.map((s) => s.stageId)) as unknown as OppRow[];
    // The rep's latest outbound human call per contact (one per call id; the leg with the longest duration carries the outcome).
    const contactIds = [...new Set(opps.map((o) => o.contact_id).filter((x): x is string => Boolean(x)))];
    const last = new Map<string, { t: string; statuses: string | null; d: number | null }>();
    const threshold = conversationMinSeconds();
    for (let i = 0; i < contactIds.length; i += 500) {
      const chunk = contactIds.slice(i, i + 500);
      const rows = getDb()
        .prepare(
          `SELECT contact_id, MIN(date_added) AS t, GROUP_CONCAT(DISTINCT call_status) AS statuses, MAX(duration) AS d
             FROM calls WHERE direction = 'outbound' AND automated = 0 AND NULLIF(user_id, '') = ? AND contact_id IN (${chunk.map(() => "?").join(",")})
            GROUP BY COALESCE(alt_id, id)`,
        )
        .all(rep.userId, ...chunk) as unknown as { contact_id: string; t: string; statuses: string | null; d: number | null }[];
      for (const r of rows) {
        const cur = last.get(r.contact_id);
        if (!cur || r.t > cur.t) last.set(r.contact_id, { t: r.t, statuses: r.statuses, d: r.d });
      }
    }
    for (const o of opps) {
      const s = byStageId.get(o.stage_id);
      if (!s) continue;
      const call = o.contact_id ? last.get(o.contact_id) : undefined;
      const since = call ? call.t : (o.last_stage_change_at ?? o.first_seen_at);
      const days = (now.getTime() - Date.parse(since)) / 86_400_000;
      if (!(days > cfg.silentDays)) continue;
      leads.push({
        contactId: o.contact_id,
        opportunityId: o.id,
        name: o.cname ?? o.name ?? "(no name)",
        ghlUrl: o.contact_id ? contactUrl(o.contact_id) : null,
        cls: classifyTags(o.tags),
        program: s.program,
        pipeline: s.pipelineName,
        stage: s.stageName,
        stageId: s.stageId,
        lastCallAt: call ? call.t : null,
        lastCallOutcome: call ? OUTCOME_LABEL[classifyOutcome(pickStatus(call.statuses), call.d, threshold)] : null,
        silentSince: since,
        silentBasis: call ? "call" : "stage",
        daysSilent: Math.floor(days),
      });
    }
  }
  leads.sort((a, b) => b.daysSilent - a.daysSilent || a.name.localeCompare(b.name));
  const byStage = stages
    .map((s) => {
      const mine = leads.filter((l) => l.stageId === s.stageId);
      return { stageId: s.stageId, stage: s.stageName, pipeline: s.pipelineName, program: s.program, army: mine.filter((l) => l.program === "army").length, veteran: mine.filter((l) => l.program === "veteran").length, total: mine.length };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  return {
    total: leads.length,
    army: leads.filter((l) => l.program === "army").length,
    veteran: leads.filter((l) => l.program === "veteran").length,
    byStage,
    leads,
    silentDays: cfg.silentDays,
    stageNames: cfg.stageNames,
    asOf,
    notes: [
      `Needs a call — your open opportunities sitting in an active working stage (${cfg.stageNames.join(", ")}; both program pipelines) with no outbound call from you for more than ${n(cfg.silentDays)} days. A snapshot as of the last sync; the date range does not apply.`,
      "Your last call — your most recent outbound human call to the contact, one per call ID, automated and campaign calls excluded (the same call-touch rule as the Leads section, restricted to your own calls). Texts and emails do not reset the clock: this card is about calls.",
      "Days silent — since that call, or, when you have never called the contact, since the opportunity entered its current stage (GHL's stage-entry time, otherwise when the dashboard first saw it there), so a lead that just arrived in a tier is not flagged.",
      "Last call outcome — how that call ended (Conversation, Short pickup, Voicemail, No answer, Failed), estimated by GHL status and duration.",
      "Army / Veteran — the pipeline the opportunity sits in; the by-stage table and the drilldown list each lead once per opportunity.",
      "Links open the contact in GHL; nothing here changes GHL.",
    ],
  };
}

/** Needs-a-call count per active rep (the Rep Performance cards and the midweek check-in). */
export function needsCallCounts(now: Date): { counts: Map<string, number>; silentDays: number } {
  const counts = new Map<string, number>();
  for (const rep of activeReps(now)) counts.set(rep.userId, computeNeedsCall(rep, now).total);
  return { counts, silentDays: leadsConfig().needsCall.silentDays };
}

/** Drilldown rows for the card: each lead with its stage, days silent, last call, and the GHL link; longest silent first. */
export function needsCallRows(r: NeedsCallResult, repName: string): DrillRow[] {
  return r.leads.map((l) => ({
    contactId: l.contactId,
    opportunityId: l.opportunityId,
    name: l.name,
    ghlUrl: l.ghlUrl,
    source: null,
    assignedUser: repName,
    pipeline: l.pipeline,
    status: "open",
    phone: null,
    email: null,
    value: null,
    stage: l.stage,
    stageReached: l.stage,
    milestoneKey: "needsCall",
    tags: [],
    createdOn: null,
    reachedOn: l.silentSince,
    tagClass: TAG_CLASS_LABEL[l.cls],
    lastTouchAt: l.lastCallAt,
    lastCallAt: l.lastCallAt,
    lastCallOutcome: l.lastCallOutcome,
    daysSilent: l.daysSilent,
    daysEstimated: l.silentBasis === "stage",
    segments: [l.stageId],
  }));
}
