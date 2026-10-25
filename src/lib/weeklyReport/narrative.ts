// The reports' written parts from the Anthropic Messages API, using the model
// named in config/assistant.json and ANTHROPIC_API_KEY from .env. The model is
// handed the computed numbers only; it must not compute or invent any. Every
// number in its reply is checked against the numbers it was given, and the
// whole narrative is dropped (numbers-only email) if any number is new, the
// call fails, or the reply is malformed. Never logs the key. Server-only.
//
// Sunday report: brief, leaderboard sentence, trend commentary, projections
// wording, three tips. Midweek check-in: brief and two tips for the rest of
// the week.

import fs from "node:fs";
import path from "node:path";
import { fmtValue, type WeeklyReportData } from "./data";

export interface Narrative {
  /** One sentence "week in brief" at the top of the email. */
  brief: string;
  /** One sentence on the spread across reps, under the leaderboard's highlight tiles. */
  leaderboard: string;
  trend: string;
  projections: string;
  tips: string[];
  model: string;
}

export interface MidweekNarrative {
  brief: string;
  tips: string[];
  model: string;
}

export interface NarrativeOutcome<T = Narrative> {
  narrative: T | null;
  /** Why the narrative was left out (shown on the Mapping page's send log). */
  skipped?: string;
  durationMs: number;
}

interface AssistantConfig {
  model: string;
  maxTokens: number;
  timeoutSeconds: number;
}

export function assistantConfig(): AssistantConfig {
  const file = path.join(process.cwd(), "config", "assistant.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  return {
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : "claude-sonnet-5-5",
    maxTokens: int(raw.maxTokens, 200, 8000, 1200),
    timeoutSeconds: int(raw.timeoutSeconds, 5, 300, 60),
  };
}

const pct = (v: number | null) => (v === null ? "unavailable" : `${Math.round(v * 100)}%`);
const perDay = (v: number | null, goal: number | null, soFar: number | null) => (goal === null ? "no goal" : v === null ? (soFar !== null && soFar >= goal ? "goal met" : "no working days left") : v >= 20 ? String(Math.round(v)) : v.toFixed(1));

/** The compact, pre-formatted numbers the model is allowed to use. Strings, so it copies them as written. */
export function narrativeInput(d: WeeklyReportData): Record<string, unknown> {
  const h = (key: string) => d.headlines.find((x) => x.key === key)!;
  const line = (key: string) => {
    const x = h(key);
    return { thisWeek: fmtValue(x.kind, x.value), lastWeek: x.prevUnavailable ? "unavailable" : fmtValue(x.kind, x.prev), goal: x.goal === null ? "no goal" : fmtValue(x.kind, x.goal) };
  };
  return {
    week: d.rangeText,
    comparedWith: d.prevRangeText,
    weekStillInProgress: d.partial,
    headline: {
      combinedSubmissions: line("combined"),
      armyCA101Submissions: line("army"),
      veteranIauSubmissions: line("iau"),
      submissionsOpportunityValue: (() => {
        const o = h("combined").oppValue;
        return o ? { thisWeek: fmtValue("usd", o.value), lastWeek: fmtValue("usd", o.prev) } : "unavailable";
      })(),
      dials: line("dials"),
      talkTime: line("talk"),
      appointmentsBooked: line("booked"),
      appointmentsCompleted: line("completed"),
      showRate: line("showRate"),
      leadsCreated: line("newLeads"),
      leadsAssigned: line("assigned"),
      wonOpportunities: line("won"),
      wonOpportunityValue: line("wonValue"),
    },
    reps: d.reps.map((r) => ({
      name: r.name,
      rank: String(r.rank),
      combinedSubmissions: String(r.combined),
      combinedLastWeek: r.combinedPrev === null ? "unavailable" : String(r.combinedPrev),
      weeklyGoal: r.combinedGoal === null ? "no goal" : String(Math.round(r.combinedGoal)),
      goalAttainment: pct(r.attainment),
      dials: String(r.dials),
      dialsLastWeek: r.dialsPrev === null ? "unavailable" : String(r.dialsPrev),
      talkTime: fmtValue("minutes", r.talkMinutes),
      appointmentsBooked: String(r.booked),
      showRate: pct(r.showRate),
      won: String(r.won),
    })),
    topPerformer: d.topPerformer?.name ?? "none",
    repsAtOrAboveGoal: `${d.reps.filter((r) => r.attainment !== null && r.attainment >= 1).length} of ${d.reps.length}`,
    biggestImprover: d.biggestImprover ? `${d.biggestImprover.rep.name} (+${d.biggestImprover.delta} submissions vs last week)` : "none",
    monthToDate: {
      month: d.pace.monthLabel,
      workingDaysElapsed: String(d.pace.workingDaysElapsed),
      workingDaysRemaining: String(d.pace.workingDaysRemaining),
      workingDaysTotal: String(d.pace.workingDaysTotal),
      team: { submissions: String(d.pace.team.mtd), quota: String(d.pace.team.quota), projectedMonthEnd: d.pace.team.projected === null ? "unavailable" : String(d.pace.team.projected), neededPerWorkingDay: d.pace.team.neededPerDay === null ? "unavailable" : d.pace.team.neededPerDay.toFixed(1) },
      reps: d.pace.reps.map((r) => ({ name: r.name, submissions: String(r.mtd), quota: String(r.quota), quotaPct: pct(r.quotaPct), projectedMonthEnd: r.projected === null ? "unavailable" : String(r.projected), neededPerWorkingDay: r.neededPerDay === null ? "unavailable" : r.neededPerDay.toFixed(1) })),
      estimatedCommissionToDate: fmtValue("usd", d.pace.commissionMtd),
    },
    funnel: d.funnel.steps.map((s) => ({ step: s.label, thisWeek: s.cur === null ? "unavailable" : String(s.cur), lastWeek: s.prev === null ? "unavailable" : String(s.prev) })),
    pipelineHealth: {
      staleLeads: String(d.pipeline.stale.count),
      staleRuleDays: String(d.pipeline.stale.staleAfterDays),
      untouchedLeads: String(d.pipeline.untouched.count),
      untouchedDays: String(d.pipeline.untouched.days),
      awaitingSupervisorApproval: String(d.pipeline.approval.inStage),
      approvalOver30Days: String(d.pipeline.approval.buckets[3]?.count ?? 0),
      unassignedLeadsFourWeeks: String(d.pipeline.unassigned.fourWeeks),
      deadEndLeads: String(d.pipeline.deadEnd.parked),
      staleConversations: String(d.pipeline.staleConversations.conversations),
    },
    fourWeekTrend: d.trend.map((t) => ({ week: t.label, combinedSubmissions: t.combined === null ? "unavailable" : String(t.combined), dials: String(t.dials), talkTime: fmtValue("minutes", t.talkMinutes), appointmentsBooked: t.booked === null ? "unavailable" : String(t.booked), showRate: pct(t.showRate), leadsCreated: t.newLeads === null ? "unavailable" : String(t.newLeads), won: String(t.won) })),
    flags: d.flags.map((f) => f.text),
  };
}

/** The midweek check-in's numbers: the week so far, the same window last week, and what it takes to finish the week. */
export function midweekInput(d: WeeklyReportData): Record<string, unknown> {
  const base = narrativeInput(d);
  const f = d.finish;
  return {
    ...base,
    weekSoFar: d.rangeText,
    comparedWithSamePointLastWeek: d.prevRangeText,
    workingDaysElapsedThisWeek: String(f.elapsedWorkingDays),
    workingDaysLeftThisWeek: `${f.remainingWorkingDays} (${f.remainingLabel})`,
    toFinishTheWeek: {
      team: f.team.map((t) => ({ metric: t.label, soFar: t.soFar === null ? "unavailable" : String(t.soFar), weeklyGoal: t.goal === null ? "no goal" : String(Math.round(t.goal)), neededPerRemainingWorkingDay: perDay(t.needPerDay, t.goal, t.soFar) })),
      reps: f.reps.map((r) => ({
        name: r.name,
        submissionsSoFar: String(r.combined.soFar),
        submissionsGoal: r.combined.goal === null ? "no goal" : String(Math.round(r.combined.goal)),
        submissionsNeededPerDay: perDay(r.combined.needPerDay, r.combined.goal, r.combined.soFar),
        belowPace: r.combined.belowPace ? "yes" : "no",
        dialsSoFar: String(r.dials.soFar),
        dialsNeededPerDay: perDay(r.dials.needPerDay, r.dials.goal, r.dials.soFar),
        bookedSoFar: String(r.booked.soFar),
        bookedNeededPerDay: perDay(r.booked.needPerDay, r.booked.goal, r.booked.soFar),
      })),
    },
  };
}

const RULES = `Hard rules:
- Use ONLY the numbers in the JSON you are given, written exactly as they appear there (same digits, same formatting). Never compute, round, add, average, or infer a new number. If a figure is "unavailable", say so or leave it out; never guess.
- Do not invent names, events, causes, or figures that are not in the data.
- Say "estimated" when mentioning commission.
- Dollar figures are Opportunity Value, never revenue or cash.
- Reply with JSON only, no markdown fences.`;

const SYSTEM_WEEKLY = `You write the narrative parts of a weekly sales report email for Veteran Careers Network's sales team (a small team of reps who call leads, book appointments, and submit program applications for Army CA 101 and Veteran G.I. Bill IAU programs). The reader is the sales leadership on a Sunday evening. Be concrete, plain, and brief.

${RULES}
- JSON shape:
  {"brief": "<ONE sentence, under 30 words, summing up the week: the combined submissions result against goal and the one other number that matters most>", "leaderboard": "<ONE sentence, under 30 words, on the spread across reps this week: who led and with what, who trailed, and how many reps met their weekly goal, copying repsAtOrAboveGoal as written>", "trend": "<2-3 sentences on the four-week trend and this week vs last week>", "projections": "<2-3 sentences on month-to-date pace: who is on track, what the team needs per working day>", "tips": ["<tip 1>", "<tip 2>", "<tip 3>"]}
- Each tip is one or two sentences, actionable for the coming week, grounded in a specific number from the data. Do not number the tips.`;

const SYSTEM_MIDWEEK = `You write the two short written parts of a midweek check-in email for Veteran Careers Network's sales team (reps who call leads, book appointments, and submit program applications for Army CA 101 and Veteran G.I. Bill IAU programs). It is Wednesday afternoon: the numbers cover Monday through now, compared with the same Monday-to-now window last week, and the goals are FULL weekly goals, so being under goal midweek is normal; what matters is pace and what is needed per remaining working day. Be concrete, plain, and brief.

${RULES}
- JSON shape:
  {"brief": "<ONE sentence, under 30 words: combined submissions so far against the weekly goal, and the one other number that matters most for the rest of the week>", "tips": ["<tip 1>", "<tip 2>"]}
- Each tip is one or two sentences, actionable for Thursday and Friday, grounded in a specific number from the data (use the toFinishTheWeek figures). Do not number the tips.`;

/** Every number token in a text, normalised (commas removed). */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((t) => t.replace(/,/g, ""));
}

/** True when every number in `text` also appears in the data the model was given. */
export function numbersAreGrounded(text: string, allowed: Set<string>): { ok: boolean; offending: string[] } {
  const offending = numbersIn(text).filter((t) => !allowed.has(t) && !allowed.has(t.replace(/\.0+$/, "")));
  return { ok: offending.length === 0, offending };
}

type Parsed = Record<string, unknown>;

/** One call to the model: returns the parsed JSON reply, or the reason it was skipped. */
async function askModel(system: string, input: Record<string, unknown>, fetchImpl: typeof fetch): Promise<{ parsed?: Parsed; allowed: Set<string>; skipped?: string; model: string }> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const cfg = assistantConfig();
  const payload = JSON.stringify(input);
  const allowed = new Set(numbersIn(payload));
  if (!key) return { allowed, skipped: "ANTHROPIC_API_KEY is not set; numbers-only email.", model: cfg.model };
  let text = "";
  try {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.model, max_tokens: cfg.maxTokens, system, messages: [{ role: "user", content: `Here are the numbers as JSON. Write the narrative.\n\n${payload}` }] }),
      signal: AbortSignal.timeout(cfg.timeoutSeconds * 1000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300).replace(/[\r\n]+/g, " ");
      return { allowed, skipped: `Anthropic API answered ${res.status}: ${body}`, model: cfg.model };
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (json.stop_reason === "max_tokens") return { allowed, skipped: `The model's reply was cut off at ${cfg.maxTokens} tokens (raise maxTokens in config/assistant.json); numbers-only email.`, model: cfg.model };
  } catch (e) {
    return { allowed, skipped: `Anthropic API call failed: ${(e as Error).message}`, model: cfg.model };
  }
  // Tolerate a fenced reply or a sentence around the JSON object; raw line breaks inside strings are the usual parse failure.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  const stripped = (first >= 0 && last > first ? text.slice(first, last + 1) : text).replace(/[\u0000-\u001f]+/g, " ");
  try {
    return { parsed: JSON.parse(stripped) as Parsed, allowed, model: cfg.model };
  } catch {
    return { allowed, skipped: `The model's reply was not valid JSON (starts "${text.slice(0, 120).replace(/\s+/g, " ")}"); numbers-only email.`, model: cfg.model };
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const tipsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim().slice(0, 400)) : []);

/** The Sunday report's narrative. */
export async function generateNarrative(d: WeeklyReportData, fetchImpl: typeof fetch = fetch): Promise<NarrativeOutcome> {
  const t0 = Date.now();
  const r = await askModel(SYSTEM_WEEKLY, narrativeInput(d), fetchImpl);
  if (!r.parsed) return { narrative: null, skipped: r.skipped, durationMs: Date.now() - t0 };
  const brief = str(r.parsed.brief);
  const leaderboard = str(r.parsed.leaderboard);
  const trend = str(r.parsed.trend);
  const projections = str(r.parsed.projections);
  const tips = tipsOf(r.parsed.tips);
  if (!brief || !leaderboard || !trend || !projections || tips.length !== 3) {
    return { narrative: null, skipped: "The model's reply did not have brief, leaderboard, trend, projections, and exactly three tips; numbers-only email.", durationMs: Date.now() - t0 };
  }
  const check = numbersAreGrounded([brief, leaderboard, trend, projections, ...tips].join("\n"), r.allowed);
  if (!check.ok) return { narrative: null, skipped: `The model used numbers that are not in the data (${check.offending.slice(0, 5).join(", ")}); numbers-only email.`, durationMs: Date.now() - t0 };
  return { narrative: { brief: brief.slice(0, 300), leaderboard: leaderboard.slice(0, 300), trend, projections, tips, model: r.model }, durationMs: Date.now() - t0 };
}

/** The midweek check-in's narrative: one brief sentence and two tips. */
export async function generateMidweekNarrative(d: WeeklyReportData, fetchImpl: typeof fetch = fetch): Promise<NarrativeOutcome<MidweekNarrative>> {
  const t0 = Date.now();
  const r = await askModel(SYSTEM_MIDWEEK, midweekInput(d), fetchImpl);
  if (!r.parsed) return { narrative: null, skipped: r.skipped, durationMs: Date.now() - t0 };
  const brief = str(r.parsed.brief);
  const tips = tipsOf(r.parsed.tips);
  if (!brief || tips.length !== 2) return { narrative: null, skipped: "The model's reply did not have a brief and exactly two tips; numbers-only email.", durationMs: Date.now() - t0 };
  const check = numbersAreGrounded([brief, ...tips].join("\n"), r.allowed);
  if (!check.ok) return { narrative: null, skipped: `The model used numbers that are not in the data (${check.offending.slice(0, 5).join(", ")}); numbers-only email.`, durationMs: Date.now() - t0 };
  return { narrative: { brief: brief.slice(0, 300), tips, model: r.model }, durationMs: Date.now() - t0 };
}

/** A tiny round trip to confirm the key and model work on this host (a few tokens; never logs the key). */
export async function checkAnthropic(fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; model: string; detail: string; durationMs: number }> {
  const t0 = Date.now();
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const cfg = assistantConfig();
  if (!key) return { ok: false, model: cfg.model, detail: "ANTHROPIC_API_KEY is not set", durationMs: 0 };
  try {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.model, max_tokens: 8, messages: [{ role: "user", content: "Reply with the single word OK." }] }),
      signal: AbortSignal.timeout(Math.min(30, cfg.timeoutSeconds) * 1000),
    });
    if (!res.ok) return { ok: false, model: cfg.model, detail: `HTTP ${res.status}: ${(await res.text()).slice(0, 200).replace(/[\r\n]+/g, " ")}`, durationMs: Date.now() - t0 };
    const json = (await res.json()) as { content?: { type: string; text?: string }[]; model?: string };
    const text = (json.content ?? []).map((c) => c.text ?? "").join("").trim();
    return { ok: true, model: json.model ?? cfg.model, detail: `replied "${text.slice(0, 40)}"`, durationMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, model: cfg.model, detail: (e as Error).message, durationMs: Date.now() - t0 };
  }
}
