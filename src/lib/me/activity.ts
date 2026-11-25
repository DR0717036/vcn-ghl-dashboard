// "My activity" (owner request 2026-11-24): the admin Activity band filtered
// to one rep, for the date range in the control bar.
//   Calls Made and Talk Time — the two KPI cards with the same definitions
//     as the admin cards (human call attempts, one per call id, both
//     directions; recorded duration of completed or answered human calls),
//     restricted to the calls attributed to the rep (the user on the call's
//     legs, exactly as Rep Call Activity attributes them), judged against
//     the rep's own share of the team goal, compared with the prior period,
//     with the same per-hour / per-day / per-week series.
//   The rep's row of Rep Call Activity — conversations / connected / dials,
//     talk time, average talk per call, first call of the day, goal badges.
//   Best times to call — the rep's own heat map (selected range and the last
//     90 days). Recordings are not offered to reps.
// Reads the local cache only; nothing here calls GHL.

import { callsSeries, talkTimeSeries, type ComparedSeries } from "@/lib/charts";
import type { DateRange } from "@/lib/dates";
import { fmtDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { goalFor, type Goal } from "@/lib/goals";
import type { HeatBundle } from "@/lib/heatmap";
import { coverage, fmtMinutes, type KpiResult } from "@/lib/metrics";
import { computeRepCalls, heatBundle, outcomeRows, type RepCallRow } from "@/lib/repCalls";
import type { Rep } from "@/lib/reps";
import { repGoalOf } from "./shared";

export interface RepActivityData {
  rangeLabel: string;
  /** Calls Made, yours: the admin card's definition restricted to your calls, against your own goal. */
  calls: KpiResult;
  callsChart: ComparedSeries;
  /** Talk Time, yours. */
  talk: KpiResult;
  talkChart: ComparedSeries;
  /** Your row of the admin Rep Call Activity table (null when you are not on the roster for the range). */
  row: RepCallRow | null;
  /** Your own share of the team goals, as goals of their own (null when none is configured for you). */
  callsGoal: Goal | null;
  talkGoal: Goal | null;
  conversationMinSeconds: number;
  /** Your best-times heat map: the selected range and the last 90 days. */
  heat: HeatBundle;
  notes: string[];
}

const n = (v: number) => v.toLocaleString("en-US");
const iso = (d: Date) => d.toISOString();

function prevReason(range: DateRange, dataStart: string | undefined): string | undefined {
  if (!dataStart) return "Call history has not been loaded yet.";
  if (iso(range.prevStart) < dataStart) return `Call history starts ${fmtDay(new Date(dataStart))}, after the comparison period began.`;
  return undefined;
}

/** Human call attempts attributed to the user in [start, end): one per call id, both directions (the Calls Made definition). */
function callCounts(userId: string, start: string, end: string): { total: number; outbound: number; inbound: number } {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN dir = 'outbound' THEN 1 ELSE 0 END) AS outbound,
              SUM(CASE WHEN dir = 'inbound' THEN 1 ELSE 0 END) AS inbound
         FROM (SELECT COALESCE(alt_id, id) AS k, MIN(NULLIF(user_id, '')) AS u, MIN(direction) AS dir
                 FROM calls WHERE automated = 0 AND date_added >= ? AND date_added < ? GROUP BY COALESCE(alt_id, id))
        WHERE u = ?`,
    )
    .get(start, end, userId) as { total: number; outbound: number | null; inbound: number | null };
  return { total: r.total, outbound: r.outbound ?? 0, inbound: r.inbound ?? 0 };
}

/** Recorded seconds of the user's completed or answered human calls in [start, end) (the Talk Time definition). */
function talkSeconds(userId: string, start: string, end: string): { total: number; outbound: number; inbound: number; calls: number } {
  const r = getDb()
    .prepare(
      `SELECT SUM(d) AS total,
              SUM(CASE WHEN dir = 'outbound' THEN d ELSE 0 END) AS outbound,
              SUM(CASE WHEN dir = 'inbound' THEN d ELSE 0 END) AS inbound,
              COUNT(*) AS calls
         FROM (SELECT COALESCE(alt_id, id) AS k, MIN(NULLIF(user_id, '')) AS u, MAX(duration) AS d, MIN(direction) AS dir
                 FROM calls WHERE automated = 0 AND call_status IN ('completed', 'answered') AND duration > 0 AND date_added >= ? AND date_added < ?
                GROUP BY COALESCE(alt_id, id))
        WHERE u = ?`,
    )
    .get(start, end, userId) as { total: number | null; outbound: number | null; inbound: number | null; calls: number };
  return { total: r.total ?? 0, outbound: r.outbound ?? 0, inbound: r.inbound ?? 0, calls: r.calls };
}

export function computeRepActivity(rep: Rep, range: DateRange): RepActivityData {
  const cov = coverage();
  const start = iso(range.start);
  const end = iso(range.end);
  const reason = prevReason(range, cov.historyStart);
  const team = computeRepCalls(range);
  const row = team.rows.find((r) => r.userId === rep.userId) ?? null;
  const callsGoal = repGoalOf(goalFor("callsMade", range), rep);
  const talkGoal = repGoalOf(goalFor("talkTimeMinutes", range), rep);

  const cur = callCounts(rep.userId, start, end);
  const prevCalls = reason ? null : callCounts(rep.userId, iso(range.prevStart), iso(range.prevEnd)).total;
  const calls: KpiResult = {
    key: "me-calls",
    title: "Calls Made",
    subtitle: "Your human call attempts",
    format: "count",
    value: cur.total,
    goal: callsGoal,
    prev: prevCalls,
    prevUnavailableReason: reason,
    breakdown: [
      { label: "Outbound", value: n(cur.outbound) },
      { label: "Inbound", value: n(cur.inbound) },
      ...(row ? outcomeRows(row.outcomes).map((o) => ({ label: `Outbound outcome: ${o.label}`, value: o.value })) : []),
    ],
    notes: [
      "Calls — your human call attempts, one per call ID (linked legs and repeated updates deduplicated), both directions; the same definition as the admin Calls Made card, restricted to the calls attributed to you.",
      "Attribution — a call is yours when you are the user on its legs, exactly as the admin Rep Call Activity table attributes it; the Outbound line equals your Dials there.",
      "Excluded — automated, campaign, and IVR calls.",
    ],
  };

  const t = talkSeconds(rep.userId, start, end);
  const prevTalk = reason ? null : Math.round(talkSeconds(rep.userId, iso(range.prevStart), iso(range.prevEnd)).total / 60);
  const talk: KpiResult = {
    key: "me-talk",
    title: "Talk Time",
    subtitle: "Your recorded call duration",
    format: "minutes",
    value: Math.round(t.total / 60),
    goal: talkGoal,
    prev: prevTalk,
    prevUnavailableReason: reason,
    breakdown: [
      { label: "Outbound", value: fmtMinutes(Math.round(t.outbound / 60)) },
      { label: "Inbound", value: fmtMinutes(Math.round(t.inbound / 60)) },
      { label: "Connected calls counted", value: n(t.calls) },
    ],
    notes: [
      "Talk time — the sum of GHL call duration on your human calls with status completed or answered, either direction; the same definition as the admin Talk Time card, restricted to your calls.",
      "Excluded — calls GHL flags as voicemail, busy, no-answer, or failed.",
      "Limitation: GHL cannot distinguish a human pickup from an answering machine, so a completed call can be a machine pickup; talk time is recorded duration, not verified conversation time.",
    ],
  };

  const threshold = team.conversationMinSeconds;
  return {
    rangeLabel: range.label,
    calls,
    callsChart: callsSeries(range, rep.userId),
    talk,
    talkChart: talkTimeSeries(range, rep.userId),
    row,
    callsGoal,
    talkGoal,
    conversationMinSeconds: threshold,
    heat: heatBundle(range, (u) => u === rep.userId),
    notes: [
      "Every figure here is your row of the admin Activity section: the same calls, the same definitions, the same previous period, for the date range in the bar at the top.",
      "Dials — your outbound human call attempts, one per call ID; automated, campaign, and IVR calls are excluded.",
      `Conversation — GHL status completed with a recorded duration of at least ${threshold} seconds (estimated by duration). Short pickup / likely machine — completed but shorter. Connected — conversations plus short pickups (every completed call).`,
      "Conversation rate — conversations ÷ dials. Answer rate — connected ÷ dials.",
      "Talk time — the recorded GHL duration of your completed or answered human calls, either direction. Avg talk time per call — total talk time ÷ connected calls counted.",
      "First call (avg) — your first outbound attempt on each New York day you made any outbound call, averaged across those days only; days with no calls are excluded, not counted as zero.",
      "Goals — your own share of the team's call and talk-time goals (your rate × your working days in the range, scaled by your plan). Met = at or above the full goal; On Track = at or above the goal for the time elapsed; Missed = below it.",
      "Best times to call — your outbound dials grouped by weekday and hour in America/New_York, colored by conversation rate, connected rate, or dial volume; slots under the configured minimum dials are hatched and not ranked; hours outside the shown window still count in the totals.",
      "Drilldown — click your row for every call in the range (direction, outcome, duration, time), the per-day summary, and the heat map. Recordings are not available on the rep dashboard.",
      "Limitation: GHL marks human pickups and undetected answering machines alike as completed, so Conversation is an estimate by duration (callOutcomes.conversationMinSeconds in config/goals.json), the answer rate includes machines, and talk time is recorded duration, not verified conversation time.",
    ],
  };
}
