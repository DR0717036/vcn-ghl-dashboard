// "My scorecard" for one rep over the date range selected in the control
// bar: each figure is the rep's own row of the matching team-scorecard
// function (Rep Call Activity, Rep Appointments, Program Submissions, the
// Won row in period mode), with the rep's own goal pro-rated to the range,
// the Met / On Track / Missed status against the elapsed portion, and the
// previous-period comparison, exactly as the team's KPI cards work. Reads
// the cache only.

import { computeRepAppointments } from "@/lib/appointments";
import type { DateRange } from "@/lib/dates";
import { goalFor, repGoalStatus, type Goal, type GoalStatus } from "@/lib/goals";
import { semesters } from "@/lib/mapping-config";
import { fmtMinutes } from "@/lib/metrics";
import { computeRepCalls } from "@/lib/repCalls";
import type { Rep } from "@/lib/reps";
import { computeSubmissions } from "@/lib/submissions";
import { wonOpps } from "@/lib/wonRow";

export type Kind = "count" | "minutes" | "pct" | "usd";

export interface ScoreMetric {
  key: string;
  label: string;
  kind: Kind;
  /** Where the figure comes from on the team scorecard. */
  source: string;
  value: number | null;
  text: string;
  unavailable?: string;
  /** The previous period's figure (null = not comparable). */
  prev: number | null;
  prevUnavailable?: string;
  /** The rep's own goal for the whole range and for the elapsed part of it. */
  goal: { full: number; scaled: number } | null;
  status: GoalStatus | null;
  /** Shown instead of a goal when a weekly-rate goal has no sensible one-day share. */
  goalNote?: string;
  sub?: string;
  parts?: { label: string; text: string }[];
}

export interface RepScorecard {
  rangeLabel: string;
  partial: boolean;
  metrics: ScoreMetric[];
  notes: string[];
}

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function fmtKind(kind: Kind, v: number | null): string {
  if (v === null) return "—";
  if (kind === "minutes") return fmtMinutes(Math.round(v));
  if (kind === "pct") return `${Math.round(v * 100)}%`;
  if (kind === "usd") return usd(v);
  return n(v);
}

interface Figures {
  dials: number;
  conversations: number;
  talk: number;
  connected: number;
  booked: number;
  showed: number;
  noshow: number;
  showRate: number | null;
  submissions: number | null;
  subsUnavailable?: string;
  ca101: number;
  semParts: { label: string; text: string }[];
  won: number;
  wonValue: number;
  goals: { calls: Goal | null; talk: Goal | null; booked: Goal | null; completed: Goal | null; subs: Goal | null };
}

/** The rep's figures over one range, from the team functions. */
function figures(rep: Rep, range: DateRange): Figures {
  const calls = computeRepCalls(range);
  const appts = computeRepAppointments(range);
  const subs = computeSubmissions(range, "all");
  const c = calls.rows.find((r) => r.userId === rep.userId);
  const a = appts.rows.find((r) => r.userId === rep.userId);
  const s = subs.rows.find((r) => r.userId === rep.userId);
  const won = wonOpps("period", range).filter((o) => o.assignedTo === rep.userId);
  return {
    dials: c?.dials ?? 0,
    conversations: c?.conversations ?? 0,
    talk: c ? Math.round(c.talkSeconds / 60) : 0,
    connected: c?.connected ?? 0,
    booked: a?.booked ?? 0,
    showed: a?.showed ?? 0,
    noshow: a?.noshow ?? 0,
    showRate: a && a.showRate !== null ? a.showRate : null,
    submissions: subs.value === null ? null : (s?.total ?? 0),
    subsUnavailable: subs.unavailableReason,
    ca101: s?.ca101 ?? 0,
    semParts: (subs.parts?.iau ?? []).map((p) => {
      const sem = semesters().find((x) => x.submittedKey === p.key);
      return { label: `Veteran IAU · ${sem?.short ?? p.reportingGroup}`, text: n(p.reps.find((r) => r.userId === rep.userId)?.contacts ?? 0) };
    }),
    won: won.length,
    wonValue: won.reduce((t, o) => t + (o.value ?? 0), 0),
    goals: { calls: calls.callsGoal, talk: calls.talkGoal, booked: appts.bookedGoal, completed: goalFor("appointmentsCompleted", range), subs: subs.goal },
  };
}

/** The comparison period as a range of its own (values only; goals are not needed for it). */
function prevRangeOf(range: DateRange): DateRange {
  return { ...range, start: range.prevStart, end: range.prevEnd, fullEnd: range.prevEnd, partial: false };
}

export function computeRepScorecard(rep: Rep, range: DateRange): RepScorecard {
  const cur = figures(rep, range);
  const prev = figures(rep, prevRangeOf(range));
  const singleDay = range.key === "today" || range.key === "yesterday";

  const goalOf = (g: Goal | null, value: number | null): Pick<ScoreMetric, "goal" | "status" | "goalNote"> => {
    const r = g?.perRep[rep.userId];
    if (!g || !r || r.full <= 0) return { goal: null, status: null };
    // A weekly rate has no sensible one-day share (4 bookings a week is not 0.57 a day): show it as text for a single day.
    if (singleDay && g.unit === "week") return { goal: null, status: null, goalNote: `Weekly goal ${n(Math.round(r.rate))}` };
    return { goal: { full: r.full, scaled: r.scaled }, status: value === null ? null : repGoalStatus(value, g, rep.userId) };
  };
  const marked = cur.showed + cur.noshow;

  const metrics: ScoreMetric[] = [
    { key: "dials", label: "Dials", kind: "count", source: "Rep Call Activity (outbound human call attempts)", value: cur.dials, text: n(cur.dials), prev: prev.dials, ...goalOf(cur.goals.calls, cur.dials), sub: `${n(cur.conversations)} conversations` },
    { key: "talk", label: "Talk time", kind: "minutes", source: "Rep Call Activity (recorded duration of connected calls)", value: cur.talk, text: fmtMinutes(cur.talk), prev: prev.talk, ...goalOf(cur.goals.talk, cur.talk), sub: cur.connected > 0 ? `${n(cur.connected)} connected calls` : undefined },
    { key: "booked", label: "Appointments booked", kind: "count", source: "Rep Appointments, as host (bookings created in the period)", value: cur.booked, text: n(cur.booked), prev: prev.booked, ...goalOf(cur.goals.booked, cur.booked) },
    { key: "completed", label: "Appointments completed", kind: "count", source: "Rep Appointments (scheduled in the period and marked Showed)", value: cur.showed, text: n(cur.showed), prev: prev.showed, ...goalOf(cur.goals.completed, cur.showed), sub: `no-show ${n(cur.noshow)}` },
    { key: "showRate", label: "Show rate", kind: "pct", source: "Rep Appointments (Showed ÷ Showed + No-show)", value: cur.showRate, text: fmtKind("pct", cur.showRate), prev: prev.showRate, prevUnavailable: prev.showRate === null ? "No appointments marked in the previous period." : undefined, goal: null, status: null, sub: marked > 0 ? `${n(cur.showed)} of ${n(marked)} marked` : "none marked yet" },
    {
      key: "submissions",
      label: "Submissions",
      kind: "count",
      source: "Program Submissions (CA 101 + IAU App, every semester; first entry per contact, credited to the owner at the event)",
      value: cur.submissions,
      text: cur.submissions === null ? "unavailable" : n(cur.submissions),
      unavailable: cur.subsUnavailable,
      prev: prev.submissions,
      ...goalOf(cur.goals.subs, cur.submissions),
      parts: [{ label: "Army CA 101", text: n(cur.ca101) }, ...cur.semParts],
    },
    { key: "won", label: "Won", kind: "count", source: "Won row, Became Won During Period (first won transition per opportunity, credited to the owner at the event)", value: cur.won, text: n(cur.won), prev: prev.won, goal: null, status: null, sub: `Opportunity Value ${usd(cur.wonValue)}` },
  ];

  return {
    rangeLabel: range.label,
    partial: range.partial,
    metrics,
    notes: [
      "Every figure equals your row in the matching section of the team scorecard for the selected date range; the counting rules are the same. Change the range in the bar at the top.",
      "Goals are your own: the team rate scaled by your plan (full-time or part-time) or a fixed override, pro-rated to the range. Met = at or above the whole range's goal; On Track = at or above the goal for the time elapsed so far ('by now', the mark on the bar); Missed = below it.",
      "Comparison — the same length of time just before the range (the same elapsed portion while the range is still in progress), as the team cards compare.",
      "Dials are outbound human call attempts, one per call ID. Talk time is the recorded duration of calls with status completed or answered, both directions.",
      "Appointments booked are bookings created in the range where you are the host. Completed are appointments scheduled in the range marked Showed; the show rate leaves out appointments not yet marked.",
      "Submissions are the first entry into CA 101 submitted (Army) or IAU App Submitted (Veteran, every semester) per contact, credited to the opportunity owner at the time of the event.",
      "Won means opportunity status = won, once per opportunity id, credited to the owner at the won event. Dollar figures are Opportunity Value, never cash collected or commission.",
    ],
  };
}
