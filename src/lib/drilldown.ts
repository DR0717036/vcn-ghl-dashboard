// Drilldown rows for the Submissions row (owner edits round 5).
//
// Everything the cache already holds (contact name, source, tags, created
// date, opportunity pipeline/stage/status/value, user names) comes from
// SQLite. Email and phone are NOT cached by the sync; they are fetched from
// GHL with GET /contacts/{id} (read-only) for ONLY the contacts in the clicked
// drilldown, then kept in contact_details for 15 minutes. The whole contact
// list is never loaded.
//
// Reconciliation: a KPI drilldown uses the same firstEvents() query as the
// card and de-duplicates per contact the same way, so its row count equals
// the card's count. Rep drilldowns split the same two event sets by the
// owner at the time of the event, so all rep rows add up to the team total.

import { getDb } from "@/lib/db";
import type { DateRange } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { getContact } from "@/lib/ghl/read";
import { mappingConfig, trackedMilestones, type MilestoneMapping } from "@/lib/mapping-config";
import { firstEvents, userNames, type EventRow } from "@/lib/milestones";
import { repRoster } from "@/lib/reps";
import { isNamedNonRep } from "@/lib/submissions";

export interface DrillRow {
  contactId: string | null;
  opportunityId: string;
  name: string | null;
  /** Link to the contact in the GHL web app, when a contact id exists. */
  ghlUrl: string | null;
  source: string | null;
  /** Opportunity owner at the time of the event: the user the submission is credited to. */
  assignedUser: string | null;
  pipeline: string | null;
  status: string | null;
  phone: string | null;
  email: string | null;
  /** Opportunity Value at the time of the event. Not revenue. */
  value: number | null;
  /** The opportunity's current stage (snapshot). */
  stage: string | null;
  /** The milestone stage this row was counted for. */
  stageReached: string;
  milestoneKey: string;
  tags: string[];
  /** Contact creation date in GHL (ISO). */
  createdOn: string | null;
  /** Event time (ISO). */
  reachedOn: string;
}

export interface DrillResult {
  ok: true;
  title: string;
  rows: DrillRow[];
  count: number;
  /** Set when GHL could not supply email/phone for some rows (shown as a dash). */
  detailsNote: string | null;
  fetchedAt: string;
}

const DETAILS_TTL_MS = 15 * 60 * 1000;
const CA101_KEY = "army_ca101";
const FS2_KEY = "vet_iau_app_submitted";

function contactUrl(contactId: string): string {
  const { locationId } = getEnv();
  const base = (process.env.GHL_APP_BASE_URL?.trim() || "https://app.gohighlevel.com").replace(/\/+$/, "");
  return `${base}/v2/location/${encodeURIComponent(locationId)}/contacts/detail/${encodeURIComponent(contactId)}`;
}

function stageNames(): { stages: Map<string, string>; pipelines: Map<string, string>; pipelineOfStage: Map<string, string> } {
  const stages = new Map<string, string>();
  const pipelines = new Map<string, string>();
  const pipelineOfStage = new Map<string, string>();
  for (const p of mappingConfig.pipelines) {
    pipelines.set(p.id, p.name);
    for (const s of p.stages) {
      stages.set(s.id, s.name);
      pipelineOfStage.set(s.id, p.id);
    }
  }
  return { stages, pipelines, pipelineOfStage };
}

interface Details {
  name: string | null;
  email: string | null;
  phone: string | null;
}

/** Email/phone for the given contacts only: cache for 15 minutes, otherwise one read-only GET per contact. */
async function contactDetails(ids: string[]): Promise<{ map: Map<string, Details>; failures: string[] }> {
  const db = getDb();
  const now = Date.now();
  const map = new Map<string, Details>();
  const failures: string[] = [];
  const toFetch: string[] = [];
  const sel = db.prepare(`SELECT fetched_at, ok, name, email, phone FROM contact_details WHERE id = ?`);
  for (const id of ids) {
    const row = sel.get(id) as { fetched_at: string; ok: number; name: string | null; email: string | null; phone: string | null } | undefined;
    if (row && row.ok === 1 && now - Date.parse(row.fetched_at) < DETAILS_TTL_MS) map.set(id, { name: row.name, email: row.email, phone: row.phone });
    else toFetch.push(id);
  }
  if (toFetch.length === 0) return { map, failures };
  const ins = db.prepare(`INSERT OR REPLACE INTO contact_details (id, fetched_at, ok, name, email, phone, error) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const results = await Promise.all(toFetch.map(async (id) => ({ id, r: await getContact(id) })));
  const at = new Date(now).toISOString();
  for (const { id, r } of results) {
    if (r.ok && r.data?.contact) {
      const c = r.data.contact;
      const full = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
      const d: Details = { name: c.name?.trim() || full || c.contactName?.trim() || null, email: c.email?.trim() || null, phone: c.phone?.trim() || null };
      ins.run(id, at, 1, d.name, d.email, d.phone, null);
      map.set(id, d);
    } else {
      const err = r.ok ? "empty response" : `${r.kind}: ${r.error}`;
      ins.run(id, at, 0, null, null, null, err);
      failures.push(err);
    }
  }
  return { map, failures };
}

/** The counted events for a milestone in the range: one per contact, same selection as the card. */
function countedEvents(m: MilestoneMapping, range: DateRange): EventRow[] {
  const rows = firstEvents(m.key, m.reportingGroup, range.start.toISOString(), range.end.toISOString());
  const seen = new Set<string>();
  const out: EventRow[] = [];
  for (const r of rows) {
    if (seen.has(r.who)) continue;
    seen.add(r.who);
    out.push(r);
  }
  return out;
}

async function enrich(events: { e: EventRow; m: MilestoneMapping }[]): Promise<{ rows: DrillRow[]; detailsNote: string | null }> {
  if (events.length === 0) return { rows: [], detailsNote: null };
  const db = getDb();
  const names = userNames();
  const { stages, pipelines, pipelineOfStage } = stageNames();
  const marks = (n: number) => Array(n).fill("?").join(",");

  const contactIds = [...new Set(events.map((x) => x.e.contact_id).filter((id): id is string => Boolean(id)))];
  const oppIds = [...new Set(events.map((x) => x.e.opportunity_id))];
  type ContactRow = { id: string; name: string | null; source: string | null; tags: string | null; date_added: string | null };
  const contacts = new Map<string, ContactRow>();
  if (contactIds.length > 0) {
    const list = db.prepare(`SELECT id, name, source, tags, date_added FROM contacts WHERE id IN (${marks(contactIds.length)})`).all(...contactIds) as unknown as ContactRow[];
    for (const c of list) contacts.set(c.id, c);
  }
  type OppRow = { id: string; name: string | null; pipeline_id: string; stage_id: string; status: string; source: string | null };
  const opps = new Map<string, OppRow>();
  const oppList = db.prepare(`SELECT id, name, pipeline_id, stage_id, status, source FROM opportunities WHERE id IN (${marks(oppIds.length)})`).all(...oppIds) as unknown as OppRow[];
  for (const o of oppList) opps.set(o.id, o);

  const { map: details, failures } = await contactDetails(contactIds);

  const rows: DrillRow[] = events.map(({ e, m }) => {
    const c = e.contact_id ? contacts.get(e.contact_id) : undefined;
    const d = e.contact_id ? details.get(e.contact_id) : undefined;
    const o = opps.get(e.opportunity_id);
    let tags: string[] = [];
    try {
      tags = c?.tags ? (JSON.parse(c.tags) as string[]) : [];
    } catch {
      tags = [];
    }
    const pipelineId = o?.pipeline_id ?? pipelineOfStage.get(m.stageId) ?? null;
    return {
      contactId: e.contact_id,
      opportunityId: e.opportunity_id,
      name: d?.name ?? c?.name ?? o?.name ?? null,
      ghlUrl: e.contact_id ? contactUrl(e.contact_id) : null,
      source: c?.source ?? o?.source ?? null,
      assignedUser: e.assigned_to_at_event ? (names.get(e.assigned_to_at_event) ?? e.assigned_to_at_event) : null,
      pipeline: pipelineId ? (pipelines.get(pipelineId) ?? pipelineId) : null,
      status: o?.status ?? null,
      phone: d?.phone ?? null,
      email: d?.email ?? null,
      value: e.value_at_event,
      stage: o ? (stages.get(o.stage_id) ?? o.stage_id) : null,
      stageReached: m.stageName,
      milestoneKey: m.key,
      tags,
      createdOn: c?.date_added ?? null,
      reachedOn: e.event_time,
    };
  });
  rows.sort((a, b) => (a.reachedOn < b.reachedOn ? 1 : a.reachedOn > b.reachedOn ? -1 : 0));

  let detailsNote: string | null = null;
  if (failures.length > 0) {
    const distinct = [...new Set(failures)];
    detailsNote = `Email and phone unavailable for ${failures.length} of ${contactIds.length} contacts (GHL: ${distinct.slice(0, 2).join("; ")}).`;
  }
  return { rows, detailsNote };
}

/** Contacts counted by one KPI card (Army CA 101, Supervisor Approval, FS2) in the range. */
export async function milestoneDrilldown(key: string, range: DateRange): Promise<DrillResult | null> {
  const m = trackedMilestones().find((x) => x.key === key);
  if (!m) return null;
  const events = countedEvents(m, range).map((e) => ({ e, m }));
  const { rows, detailsNote } = await enrich(events);
  return { ok: true, title: m.label, rows, count: rows.length, detailsNote, fetchedAt: new Date().toISOString() };
}

/**
 * Contacts credited to one user in Program Submissions (combined): CA 101 events
 * plus FS2 events whose owner at the event was that user. `user` is a GHL user
 * id, or "others" for everyone who is neither a configured rep nor a named row
 * (including unassigned).
 */
export async function repDrilldown(user: string, range: DateRange): Promise<DrillResult | null> {
  const ca = trackedMilestones().find((x) => x.key === CA101_KEY);
  const fs = trackedMilestones().find((x) => x.key === FS2_KEY);
  if (!ca || !fs) return null;
  const roster = repRoster();
  const names = userNames();
  const owned = (e: EventRow): boolean => {
    const id = e.assigned_to_at_event;
    if (user === "others") {
      if (id === null) return true;
      if (roster.byUserId.has(id)) return false;
      return !isNamedNonRep(names.get(id) ?? id);
    }
    return id === user;
  };
  const events = [...countedEvents(ca, range).map((e) => ({ e, m: ca })), ...countedEvents(fs, range).map((e) => ({ e, m: fs }))].filter((x) => owned(x.e));
  const { rows, detailsNote } = await enrich(events);
  const title = user === "others" ? "Other users, not sales reps" : (names.get(user) ?? user);
  return { ok: true, title, rows, count: rows.length, detailsNote, fetchedAt: new Date().toISOString() };
}
