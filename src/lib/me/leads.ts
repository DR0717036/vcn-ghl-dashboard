// "My leads" for one rep: the assigned leads that need action, judged with
// the same rules as the Leads section (buildLeads over every contact since
// the dashboard's history start, filtered to the rep's current assignments):
//   untouched  — live opportunity open and workable, no outbound call, SMS,
//                or email in the last touchWindowDays (config/leads.json);
//   stale      — still in the New Lead stage for more than staleAfterDays;
//   approval   — opportunities sitting in the Supervisor Approval stage
//                (the Awaiting Supervisor Approval snapshot) with their age;
//   replies    — conversations assigned to the rep whose last message is
//                inbound and unread (the stale-conversations snapshot, no
//                age filter), i.e. follow-ups due.
// Every row links to the contact in GHL. Message bodies are never included.

import { getDb } from "@/lib/db";
import { nyDayKey, resolveRange } from "@/lib/dates";
import { channelLabel, fmtWait } from "@/lib/conversations";
import { contactUrl } from "@/lib/drilldown";
import { buildLeads, leadsConfig, TAG_CLASS_LABEL, type Lead } from "@/lib/leads";
import { trackedMilestones } from "@/lib/mapping-config";
import { classifyTags } from "@/lib/metrics";
import type { Rep } from "@/lib/reps";
import { HISTORY_START } from "@/lib/sync/core";

export interface LeadRow {
  contactId: string;
  name: string;
  ghlUrl: string;
  program: string;
  pipeline: string | null;
  stage: string | null;
  /** The main figure for the list: days untouched, days in New Lead, days awaiting approval, or time waiting for a reply. */
  age: string;
  ageDays: number;
  detail: string;
  estimated?: boolean;
}

export interface LeadList {
  key: "untouched" | "stale" | "approval" | "replies";
  title: string;
  desc: string;
  count: number;
  rows: LeadRow[];
  /** Rows not shown (the list is capped). */
  more: number;
}

export interface RepLeadsData {
  assigned: number;
  lists: LeadList[];
  notes: string[];
}

const CAP = 40;
const DAY = 86_400_000;

function daysSince(iso: string | null, now: Date): number {
  return iso ? Math.max(0, (now.getTime() - Date.parse(iso)) / DAY) : 0;
}

const fmtDays = (d: number) => (d < 1 ? `${Math.round(d * 24)}h` : `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"}`);

function leadRow(l: Lead, now: Date, age: number, detail: string, estimated?: boolean): LeadRow {
  return {
    contactId: l.id,
    name: l.name ?? "(no name)",
    ghlUrl: contactUrl(l.id),
    program: TAG_CLASS_LABEL[l.cls],
    pipeline: l.opp?.pipelineName ?? null,
    stage: l.opp?.stageName ?? null,
    age: fmtDays(age),
    ageDays: age,
    detail,
    estimated,
  };
}

function list(key: LeadList["key"], title: string, desc: string, rows: LeadRow[]): LeadList {
  const sorted = [...rows].sort((a, b) => b.ageDays - a.ageDays);
  return { key, title, desc, count: sorted.length, rows: sorted.slice(0, CAP), more: Math.max(0, sorted.length - CAP) };
}

export function computeRepLeads(rep: Rep, now: Date): RepLeadsData {
  const cfg = leadsConfig();
  const db = getDb();
  const since = resolveRange("custom", now, { from: HISTORY_START.slice(0, 10), to: nyDayKey(now) });
  const mine = buildLeads(since).filter((l) => l.assignedTo === rep.userId);
  const assigned = (db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE assigned_to = ?`).get(rep.userId) as { c: number }).c;

  const untouched = mine
    .filter((l) => l.opp && l.opp.status === "open" && (l.working || l.stillNewLead) && !l.touched)
    .map((l) => leadRow(l, now, daysSince(l.lastTouchAt ?? l.createdAt, now), l.lastTouchAt ? "since your last outbound call, SMS, or email" : "never contacted since creation"));
  const stale = mine.filter((l) => l.stale).map((l) => leadRow(l, now, l.daysInNewLead ?? 0, l.daysEstimated ? "in New Lead, from the contact's creation time" : "in New Lead, from GHL's stage-entry time", l.daysEstimated));

  // Awaiting supervisor approval: the snapshot stage, this rep's opportunities, aged by GHL's stage-entry time.
  const approvalStage = trackedMilestones().find((m) => m.key === "army_supervisor_approval");
  const approval: LeadRow[] = approvalStage
    ? (
        db
          .prepare(
            `SELECT o.id, o.contact_id, c.name, c.tags, o.last_stage_change_at AS t, o.monetary_value AS v FROM opportunities o LEFT JOIN contacts c ON c.id = o.contact_id
              WHERE o.stage_id = ? AND o.missing_since IS NULL AND o.assigned_to = ?`,
          )
          .all(approvalStage.stageId, rep.userId) as unknown as { id: string; contact_id: string | null; name: string | null; tags: string | null; t: string | null; v: number | null }[]
      ).map((o) => ({
        contactId: o.contact_id ?? o.id,
        name: o.name ?? "(no name)",
        ghlUrl: o.contact_id ? contactUrl(o.contact_id) : "",
        program: TAG_CLASS_LABEL[classifyTags(o.tags)],
        pipeline: "Army CA",
        stage: approvalStage.stageName,
        age: o.t ? fmtDays(daysSince(o.t, now)) : "unknown",
        ageDays: o.t ? daysSince(o.t, now) : 0,
        detail: o.t ? "awaiting approval, from GHL's stage-entry time" : "awaiting approval; GHL has no stage-entry time for it",
      }))
    : [];

  // Replies waiting: unread, inbound-last conversations assigned to this rep (the stale-conversations snapshot without the age filter).
  const replies: LeadRow[] = (
    db
      .prepare(
        `SELECT v.id, v.contact_id, c.name, c.tags, v.unread_count, v.last_message_date, v.last_message_type FROM conversations v LEFT JOIN contacts c ON c.id = v.contact_id
          WHERE v.assigned_to = ? AND v.last_message_direction = 'inbound' AND v.unread_count > 0 AND v.last_message_date IS NOT NULL`,
      )
      .all(rep.userId) as unknown as { id: string; contact_id: string | null; name: string | null; tags: string | null; unread_count: number; last_message_date: string; last_message_type: string | null }[]
  ).map((v) => {
    const minutes = Math.max(0, (now.getTime() - Date.parse(v.last_message_date)) / 60_000);
    return {
      contactId: v.contact_id ?? v.id,
      name: v.name ?? "(no name)",
      ghlUrl: v.contact_id ? contactUrl(v.contact_id) : "",
      program: TAG_CLASS_LABEL[classifyTags(v.tags)],
      pipeline: null,
      stage: null,
      age: fmtWait(minutes),
      ageDays: minutes / 1440,
      detail: `${channelLabel(v.last_message_type)} · ${v.unread_count.toLocaleString("en-US")} unread`,
    };
  });

  return {
    assigned,
    lists: [
      list("replies", "Replies waiting", "Conversations where the last message is theirs and still unread", replies),
      list("untouched", `Untouched for ${cfg.touchWindowDays} days`, "Open, workable leads with no outbound call, SMS, or email from anyone in the window", untouched),
      list("stale", "Stale new leads", `Still in the ${cfg.newLeadStageName} stage for more than ${cfg.staleAfterDays} days`, stale),
      list("approval", "Awaiting supervisor approval", "Army CA opportunities sitting in the approval stage, oldest first", approval),
    ],
    notes: [
      "Assigned — contacts whose current owner in GHL is you, as of the last sync.",
      "Replies waiting — conversations assigned to you whose last message came from the contact and is still unread (GHL's unread count), as of the last sync; the same inbox snapshot as the Stale Conversations card, without its age filter.",
      `Untouched — leads created since ${HISTORY_START.slice(0, 10)} assigned to you whose live opportunity is open and workable (not in a dead-end stage) and that nobody has called, texted, or emailed in the last ${cfg.touchWindowDays} days (workflow sends count as a touch, as on the Leads section).`,
      `Stale — still in the ${cfg.newLeadStageName} stage for more than ${cfg.staleAfterDays} days; the age comes from GHL's stage-entry time, or from the contact's creation time when GHL has none (marked estimated).`,
      "Awaiting supervisor approval — your Army CA opportunities in the Supervisor Approval stage right now; a contact in this stage is waiting on the supervisor, not approved.",
      `Each list shows up to ${CAP} rows, oldest first. Links open the contact in GHL; nothing here changes GHL.`,
    ],
  };
}
