// Rep Call Activity (owner edits round 8): per-rep dials, talk time, and
// first-call time for the selected range, from the local calls cache only.
//
// Definitions match the Calls Made and Talk Time cards exactly so the team
// totals reconcile:
//   dials      = outbound human call attempts, one per call id (linked legs
//                and repeated updates deduplicated; automated/campaign calls
//                excluded) = the Calls Made card's "Outbound" line;
//   talk time  = recorded duration of human calls with status completed or
//                answered, both directions = the Talk Time card;
//   first call = for each New York day on which the rep made any outbound
//                attempt, the time of their first attempt; averaged across
//                those days only (days with no calls are excluded).
// A call is attributed to the user on its legs (the first non-empty user id);
// calls with no user, and users who are not configured reps, roll into
// "Other users, not sales reps" so the team total still matches the cards.

import { getDb } from "@/lib/db";
import { nyDayKey, nyParts, type DateRange } from "@/lib/dates";
import { contactUrl, type DrillResult, type DrillRow } from "@/lib/drilldown";
import { goalFor, repGoalStatus, type Goal, type GoalStatus } from "@/lib/goals";
import { fmtMinutes } from "@/lib/metrics";
import { userNames } from "@/lib/milestones";
import { repRoster, type Rep } from "@/lib/reps";

export interface RepCallRow {
  userId: string | null;
  name: string;
  isRep: boolean;
  dials: number;
  /** Outbound human calls with status completed/answered and duration > 0 (connected, not verified conversation). */
  answered: number;
  callStatus: GoalStatus | null;
  callGoal: { full: number; scaled: number } | null;
  talkSeconds: number;
  connected: number;
  avgSeconds: number | null;
  talkStatus: GoalStatus | null;
  talkGoalMinutes: { full: number; scaled: number } | null;
  /** Average first-call time of day, formatted ("9:14 AM"), or null when no outbound calls. */
  firstCallAvg: string | null;
  /** Number of days with at least one outbound attempt (the days averaged). */
  firstCallDays: number;
}

export interface RepCallsResult {
  rows: RepCallRow[];
  others: RepCallRow | null;
  total: { dials: number; answered: number; talkSeconds: number; connected: number; avgSeconds: number | null };
  callsGoal: Goal | null;
  talkGoal: Goal | null;
  unmatchedReps: Rep[];
  notes: string[];
}

interface DialKey {
  k: string;
  u: string | null;
  t: string;
}
interface TalkKey {
  k: string;
  u: string | null;
  d: number;
}

/** One row per outbound human call id with its attributed user and first timestamp. */
function dialKeys(start: string, end: string): DialKey[] {
  return getDb()
    .prepare(
      `SELECT COALESCE(alt_id, id) AS k, MIN(NULLIF(user_id, '')) AS u, MIN(date_added) AS t
         FROM calls WHERE automated = 0 AND direction = 'outbound' AND date_added >= ? AND date_added < ?
        GROUP BY COALESCE(alt_id, id)`,
    )
    .all(start, end) as unknown as DialKey[];
}

/** One row per answered outbound human call id: status completed/answered and duration > 0. */
function answeredKeys(start: string, end: string): { k: string; u: string | null }[] {
  return getDb()
    .prepare(
      `SELECT COALESCE(alt_id, id) AS k, MIN(NULLIF(user_id, '')) AS u
         FROM calls WHERE automated = 0 AND direction = 'outbound' AND call_status IN ('completed', 'answered') AND duration > 0
          AND date_added >= ? AND date_added < ?
        GROUP BY COALESCE(alt_id, id)`,
    )
    .all(start, end) as unknown as { k: string; u: string | null }[];
}

/** One row per connected human call id (either direction) with its recorded duration. */
function talkKeys(start: string, end: string): TalkKey[] {
  return getDb()
    .prepare(
      `SELECT COALESCE(alt_id, id) AS k, MIN(NULLIF(user_id, '')) AS u, MAX(duration) AS d
         FROM calls WHERE automated = 0 AND call_status IN ('completed', 'answered') AND duration > 0 AND date_added >= ? AND date_added < ?
        GROUP BY COALESCE(alt_id, id)`,
    )
    .all(start, end) as unknown as TalkKey[];
}

function secondsOfDay(iso: string): number {
  const p = nyParts(new Date(iso));
  return p.h * 3600 + p.mi * 60 + p.s;
}

/** "9:14 AM" from seconds since New York midnight. */
export function fmtClock(sec: number): string {
  const h24 = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** "4m 12s" (or "1h 02m" past an hour). */
export function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

/** Average first-call time across the days that have any dial. */
function firstCallAverage(times: string[]): { avg: string | null; days: number } {
  const firstByDay = new Map<string, number>();
  for (const t of times) {
    const day = nyDayKey(new Date(t));
    const sec = secondsOfDay(t);
    const cur = firstByDay.get(day);
    if (cur === undefined || sec < cur) firstByDay.set(day, sec);
  }
  if (firstByDay.size === 0) return { avg: null, days: 0 };
  const sum = [...firstByDay.values()].reduce((a, b) => a + b, 0);
  return { avg: fmtClock(sum / firstByDay.size), days: firstByDay.size };
}

export function computeRepCalls(range: DateRange): RepCallsResult {
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const roster = repRoster();
  const names = userNames();
  const callsGoal = goalFor("callsMade", range);
  const talkGoal = goalFor("talkTimeMinutes", range);

  const dials = dialKeys(start, end);
  const talks = talkKeys(start, end);
  const answered = answeredKeys(start, end);
  const isRep = (u: string | null) => u !== null && roster.byUserId.has(u);
  const bucket = (u: string | null): string => (isRep(u) ? (u as string) : "__others");

  const dialsBy = new Map<string, string[]>();
  for (const d of dials) dialsBy.set(bucket(d.u), [...(dialsBy.get(bucket(d.u)) ?? []), d.t]);
  const answeredBy = new Map<string, number>();
  for (const a of answered) answeredBy.set(bucket(a.u), (answeredBy.get(bucket(a.u)) ?? 0) + 1);
  const talkBy = new Map<string, { sec: number; n: number }>();
  for (const t of talks) {
    const b = bucket(t.u);
    const cur = talkBy.get(b) ?? { sec: 0, n: 0 };
    talkBy.set(b, { sec: cur.sec + t.d, n: cur.n + 1 });
  }

  const row = (userId: string | null, name: string, key: string): RepCallRow => {
    const times = dialsBy.get(key) ?? [];
    const talk = talkBy.get(key) ?? { sec: 0, n: 0 };
    const fc = firstCallAverage(times);
    const isConfigured = userId !== null && roster.byUserId.has(userId);
    const cg = isConfigured && callsGoal ? callsGoal.perRep[userId] : undefined;
    const tg = isConfigured && talkGoal ? talkGoal.perRep[userId] : undefined;
    return {
      userId,
      name,
      isRep: isConfigured,
      dials: times.length,
      answered: answeredBy.get(key) ?? 0,
      callStatus: isConfigured && callsGoal && userId ? repGoalStatus(times.length, callsGoal, userId) : null,
      callGoal: cg ? { full: cg.full, scaled: cg.scaled } : null,
      talkSeconds: talk.sec,
      connected: talk.n,
      avgSeconds: talk.n > 0 ? talk.sec / talk.n : null,
      talkStatus: isConfigured && talkGoal && userId ? repGoalStatus(talk.sec / 60, talkGoal, userId) : null,
      talkGoalMinutes: tg ? { full: tg.full, scaled: tg.scaled } : null,
      firstCallAvg: fc.avg,
      firstCallDays: fc.days,
    };
  };

  const rows = [...roster.byUserId.entries()].map(([id, rep]) => row(id, rep.name, id)).sort((a, b) => b.dials - a.dials || a.name.localeCompare(b.name));
  const otherUsers = new Set<string | null>();
  for (const d of dials) if (!isRep(d.u)) otherUsers.add(d.u);
  for (const t of talks) if (!isRep(t.u)) otherUsers.add(t.u);
  const otherNames = [...otherUsers].map((u) => (u === null ? "no user" : (names.get(u) ?? u))).sort();
  const others = otherUsers.size > 0 ? row(null, `Other users, not sales reps (${otherNames.join(", ")})`, "__others") : null;

  const totalDials = dials.length;
  const totalTalk = talks.reduce((s, t) => s + t.d, 0);
  return {
    rows,
    others,
    total: { dials: totalDials, answered: answered.length, talkSeconds: totalTalk, connected: talks.length, avgSeconds: talks.length > 0 ? totalTalk / talks.length : null },
    callsGoal,
    talkGoal,
    unmatchedReps: roster.unmatched,
    notes: [
      "Dials are outbound human call attempts only, one per call id (linked legs and repeated updates deduplicated). Automated, campaign, and IVR calls are excluded. The team total equals the Outbound line of the Calls Made card.",
      "Answered is an outbound human call with status completed or answered and a duration above zero (busy, no-answer, failed, and voicemail excluded). GHL cannot distinguish a human pickup from an answering machine, so answered means connected, not verified conversation.",
      "Talk time is the recorded GHL call duration of human calls with status completed or answered, in either direction. It is recorded duration, not verified conversation time; a completed status can include answering-machine pickups GHL did not detect. The team total equals the Talk Time card.",
      "Avg talk time per call is total talk time divided by the connected calls counted.",
      "First call (avg) uses the rep's first outbound attempt on each New York day they made any outbound call, averaged across those days only; days with no calls are excluded, not counted as zero.",
      "Calls are credited to the user on the call record. Calls with no user, and users who are not sales reps, are grouped as other users and still count in the team total.",
      ...(callsGoal ? [`Call goal basis: ${callsGoal.basis}.`] : []),
      ...(talkGoal ? [`Talk time goal basis: ${talkGoal.basis} (minutes).`] : []),
    ],
  };
}

/** A rep's calls in the range (both directions, human only) plus a per-day summary. `user` is a GHL user id or "others". */
export function callsDrilldown(user: string, range: DateRange): DrillResult {
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const roster = repRoster();
  const names = userNames();
  const owned = (u: string | null) => (user === "others" ? u === null || !roster.byUserId.has(u) : u === user);
  const calls = (
    getDb()
      .prepare(
        `SELECT COALESCE(alt_id, id) AS k, MIN(NULLIF(user_id, '')) AS u, MIN(date_added) AS t, MIN(direction) AS dir, MAX(duration) AS d,
                MAX(call_status) AS st, MIN(contact_id) AS cid
           FROM calls WHERE automated = 0 AND date_added >= ? AND date_added < ?
          GROUP BY COALESCE(alt_id, id)`,
      )
      .all(start, end) as unknown as { k: string; u: string | null; t: string; dir: string | null; d: number | null; st: string | null; cid: string | null }[]
  ).filter((c) => owned(c.u));

  const contactIds = [...new Set(calls.map((c) => c.cid).filter((id): id is string => Boolean(id)))];
  const contactName = new Map<string, string | null>();
  if (contactIds.length > 0) {
    const marks = contactIds.map(() => "?").join(",");
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${marks})`).all(...contactIds) as unknown as { id: string; name: string | null }[]) contactName.set(c.id, c.name);
  }
  const connected = (c: { st: string | null; d: number | null }) => (c.st === "completed" || c.st === "answered") && (c.d ?? 0) > 0;
  // The message id of the connected leg carries the recording (verified: GHL serves recordings by message id, not altId).
  const recordingIdByKey = new Map<string, string>();
  for (const leg of getDb()
    .prepare(
      `SELECT COALESCE(alt_id, id) AS k, id FROM calls WHERE automated = 0 AND call_status IN ('completed', 'answered') AND duration > 0
        AND date_added >= ? AND date_added < ? ORDER BY duration DESC`,
    )
    .all(start, end) as unknown as { k: string; id: string }[]) {
    if (!recordingIdByKey.has(leg.k)) recordingIdByKey.set(leg.k, leg.id);
  }

  const rows: DrillRow[] = calls
    .map((c) => ({
      contactId: c.cid,
      opportunityId: c.k,
      name: c.cid ? (contactName.get(c.cid) ?? null) : null,
      ghlUrl: c.cid ? contactUrl(c.cid) : null,
      source: null,
      assignedUser: c.u ? (names.get(c.u) ?? c.u) : null,
      pipeline: null,
      status: null,
      phone: null,
      email: null,
      value: null,
      stage: null,
      stageReached: "call",
      milestoneKey: "call",
      tags: [],
      createdOn: null,
      reachedOn: c.t,
      direction: c.dir,
      outcome: c.st,
      durationSec: connected(c) ? c.d : c.d && c.d > 0 ? c.d : null,
      answered: (c.dir === "outbound" ? (connected(c) ? "yes" : "no") : "na") as "yes" | "no" | "na",
      recordingId: connected(c) ? (recordingIdByKey.get(c.k) ?? null) : null,
    }))
    .sort((a, b) => (a.reachedOn < b.reachedOn ? 1 : -1));

  // per-day summary: dials, talk time, first outbound call
  const byDay = new Map<string, { dials: number; talk: number; first: number | null }>();
  for (const c of calls) {
    const day = nyDayKey(new Date(c.t));
    const cur = byDay.get(day) ?? { dials: 0, talk: 0, first: null };
    if (c.dir === "outbound") {
      cur.dials += 1;
      const sec = secondsOfDay(c.t);
      if (cur.first === null || sec < cur.first) cur.first = sec;
    }
    if (connected(c)) cur.talk += c.d ?? 0;
    byDay.set(day, cur);
  }
  const perDay = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, v]) => ({ day, dials: v.dials, talk: v.talk > 0 ? fmtMinutes(Math.round(v.talk / 60)) : "—", firstCall: v.first === null ? "—" : fmtClock(v.first) }));

  const title = user === "others" ? "Other users, not sales reps" : (roster.byUserId.get(user)?.name ?? names.get(user) ?? user);
  return { ok: true, title, rows, count: rows.length, perDay, detailsNote: null, fetchedAt: new Date().toISOString() };
}
