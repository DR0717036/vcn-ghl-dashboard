// The weekly report's written parts (trend commentary, projections wording,
// three tips) from the Anthropic Messages API, using the model named in
// config/assistant.json and ANTHROPIC_API_KEY from .env. The model is handed
// the computed numbers only; it must not compute or invent any. Every number
// in its reply is checked against the numbers it was given, and the whole
// narrative is dropped (numbers-only email) if any number is new, the call
// fails, or the reply is malformed. Never logs the key. Server-only.

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

export interface NarrativeOutcome {
  narrative: Narrative | null;
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

const SYSTEM = `You write the narrative parts of a weekly sales report email for Veteran Careers Network's sales team (a small team of reps who call leads, book appointments, and submit program applications for Army CA 101 and Veteran G.I. Bill IAU programs). The reader is the sales leadership on a Sunday evening. Be concrete, plain, and brief.

Hard rules:
- Use ONLY the numbers in the JSON you are given, written exactly as they appear there (same digits, same formatting). Never compute, round, add, average, or infer a new number. If a figure is "unavailable", say so or leave it out; never guess.
- Do not invent names, events, causes, or figures that are not in the data.
- Say "estimated" when mentioning commission.
- Dollar figures are Opportunity Value, never revenue or cash.
- Reply with JSON only, no markdown fences, in this shape:
  {"brief": "<ONE sentence, under 30 words, summing up the week: the combined submissions result against goal and the one other number that matters most>", "leaderboard": "<ONE sentence, under 30 words, on the spread across reps this week: who led and with what, who trailed, and how many reps met their weekly goal, copying repsAtOrAboveGoal as written>", "trend": "<2-3 sentences on the four-week trend and this week vs last week>", "projections": "<2-3 sentences on month-to-date pace: who is on track, what the team needs per working day>", "tips": ["<tip 1>", "<tip 2>", "<tip 3>"]}
- Each tip is one or two sentences, actionable for the coming week, grounded in a specific number from the data. Do not number the tips.`;

/** Every number token in a text, normalised (commas removed). */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((t) => t.replace(/,/g, ""));
}

/** True when every number in `text` also appears in the data the model was given. */
export function numbersAreGrounded(text: string, allowed: Set<string>): { ok: boolean; offending: string[] } {
  const offending = numbersIn(text).filter((t) => !allowed.has(t) && !allowed.has(t.replace(/\.0+$/, "")));
  return { ok: offending.length === 0, offending };
}

export async function generateNarrative(d: WeeklyReportData, fetchImpl: typeof fetch = fetch): Promise<NarrativeOutcome> {
  const t0 = Date.now();
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { narrative: null, skipped: "ANTHROPIC_API_KEY is not set; numbers-only email.", durationMs: 0 };
  const cfg = assistantConfig();
  const input = narrativeInput(d);
  const payload = JSON.stringify(input);
  const allowed = new Set(numbersIn(payload));
  let text = "";
  try {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.model, max_tokens: cfg.maxTokens, system: SYSTEM, messages: [{ role: "user", content: `Here are this week's numbers as JSON. Write the narrative.\n\n${payload}` }] }),
      signal: AbortSignal.timeout(cfg.timeoutSeconds * 1000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300).replace(/[\r\n]+/g, " ");
      return { narrative: null, skipped: `Anthropic API answered ${res.status}: ${body}`, durationMs: Date.now() - t0 };
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (json.stop_reason === "max_tokens") return { narrative: null, skipped: `The model's reply was cut off at ${cfg.maxTokens} tokens (raise maxTokens in config/assistant.json); numbers-only email.`, durationMs: Date.now() - t0 };
  } catch (e) {
    return { narrative: null, skipped: `Anthropic API call failed: ${(e as Error).message}`, durationMs: Date.now() - t0 };
  }
  // Tolerate a fenced reply or a sentence around the JSON object, then require the exact shape.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  // Raw line breaks inside a JSON string are the usual reason a model reply fails to parse.
  const stripped = (first >= 0 && last > first ? text.slice(first, last + 1) : text).replace(/[\u0000-\u001f]+/g, " ");
  let parsed: { brief?: unknown; leaderboard?: unknown; trend?: unknown; projections?: unknown; tips?: unknown };
  try {
    parsed = JSON.parse(stripped) as typeof parsed;
  } catch {
    return { narrative: null, skipped: `The model's reply was not valid JSON (starts "${text.slice(0, 120).replace(/\s+/g, " ")}"); numbers-only email.`, durationMs: Date.now() - t0 };
  }
  const tips = Array.isArray(parsed.tips) ? parsed.tips.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim()) : [];
  if (typeof parsed.brief !== "string" || typeof parsed.leaderboard !== "string" || typeof parsed.trend !== "string" || typeof parsed.projections !== "string" || tips.length !== 3) {
    return { narrative: null, skipped: "The model's reply did not have brief, leaderboard, trend, projections, and exactly three tips; numbers-only email.", durationMs: Date.now() - t0 };
  }
  const check = numbersAreGrounded([parsed.brief, parsed.leaderboard, parsed.trend, parsed.projections, ...tips].join("\n"), allowed);
  if (!check.ok) {
    return { narrative: null, skipped: `The model used numbers that are not in the data (${check.offending.slice(0, 5).join(", ")}); numbers-only email.`, durationMs: Date.now() - t0 };
  }
  return { narrative: { brief: parsed.brief.trim().slice(0, 300), leaderboard: parsed.leaderboard.trim().slice(0, 300), trend: parsed.trend.trim(), projections: parsed.projections.trim(), tips: tips.map((t) => t.slice(0, 400)), model: cfg.model }, durationMs: Date.now() - t0 };
}
