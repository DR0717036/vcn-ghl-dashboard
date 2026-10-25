// Builds and sends the two report emails (Sunday weekly report, Wednesday
// midweek check-in) and decides when each scheduled send is due. Idempotent:
// the cache keeps one scheduled row per report week and report kind (unique
// indexes), claimed BEFORE the send starts, so a restart or redeploy cannot
// send the same report twice. SMTP is retried once. Every attempt, scheduled
// or test, is logged for the Mapping page. Reads the local cache only; never
// GHL. Never logs credentials.

import fs from "node:fs";
import path from "node:path";
import { abandonStaleWeeklyReportSends, claimWeeklyReportSend, finishWeeklyReportSend, getState, type WeeklyReportSendKind } from "@/lib/db";
import { fmtDateTime, fmtRangeShort, startOfWeek } from "@/lib/dates";
import { gmailConfigured, sendGmail, type MailMessage } from "@/lib/mailer";
import { dueWeekStart, weekKeyOf, weekRange, weeklyReportConfig, type ReportTheme } from "./config";
import { renderTrendCharts, type ChartImage } from "./charts";
import { buildWeeklyReport, type WeeklyReportData } from "./data";
import { generateMidweekNarrative, generateNarrative, type MidweekNarrative, type Narrative } from "./narrative";
import { LOGO_CID, renderHtml, renderMidweekHtml, renderMidweekText, renderText, repPhotoAssets } from "./render";

const RETRY_DELAY_MS = 20_000;
const ABANDON_AFTER_MS = 30 * 60 * 1000;

/** Which email: the Sunday report or the Wednesday check-in. */
export type ReportKind = "weekly" | "midweek";

export interface Rendered {
  report: ReportKind;
  data: WeeklyReportData;
  narrative: Narrative | MidweekNarrative | null;
  narrativeSkipped?: string;
  narrativeMs: number;
  subject: string;
  theme: ReportTheme;
  /** The trend charts (PNG) the HTML references as cid: images (weekly only). */
  charts: ChartImage[];
  html: string;
  text: string;
}

/** The report week a preview defaults to: the last completed week for the Sunday report, the current week for the check-in. */
export function defaultWeekStart(report: ReportKind, now: Date): Date {
  return report === "midweek" ? startOfWeek(now) : new Date(startOfWeek(now).getTime() - 7 * 86_400_000);
}

/**
 * Computes a report and renders both parts. `withNarrative` false skips the
 * Anthropic call (cheap preview); `theme` overrides config/weekly-report.json
 * (previews and tests). The midweek check-in uses the same data build for the
 * week so far (Monday to `now`, compared with the same window last week).
 */
export async function renderReport(report: ReportKind, weekStart: Date, now: Date, withNarrative: boolean, theme?: ReportTheme): Promise<Rendered> {
  const cfg = weeklyReportConfig();
  const useTheme = theme ?? cfg.theme;
  const data = buildWeeklyReport(weekStart, now);
  const r = weekRange(weekStart, now);
  // The range (with the year) makes every subject distinct, so Gmail does not thread the reports together and trim repeated sections.
  const range = fmtRangeShort(r.start, r.end, true);
  if (report === "midweek") {
    const outcome = withNarrative ? await generateMidweekNarrative(data) : { narrative: null, skipped: "narrative not requested", durationMs: 0 };
    const subject = cfg.midweek.subject.replace("{range}", range);
    return { report, data, narrative: outcome.narrative, narrativeSkipped: outcome.skipped, narrativeMs: outcome.durationMs, subject, theme: useTheme, charts: [], html: renderMidweekHtml(data, outcome.narrative, useTheme), text: renderMidweekText(data, outcome.narrative) };
  }
  const outcome = withNarrative ? await generateNarrative(data) : { narrative: null, skipped: "narrative not requested", durationMs: 0 };
  let charts: ChartImage[] = [];
  try {
    charts = await renderTrendCharts(data, useTheme);
  } catch (e) {
    // The email still goes out; section 6 falls back to its caption rows.
    console.warn(`[weekly-report] trend charts skipped: ${(e as Error).message}`);
  }
  const subject = cfg.subject.replace("{range}", range);
  return { report, data, narrative: outcome.narrative, narrativeSkipped: outcome.skipped, narrativeMs: outcome.durationMs, subject, theme: useTheme, charts, html: renderHtml(data, outcome.narrative, useTheme, charts), text: renderText(data, outcome.narrative) };
}

/** Kept for callers that only know the Sunday report. */
export function renderWeeklyReport(weekStart: Date, now: Date, withNarrative: boolean, theme?: ReportTheme): Promise<Rendered> {
  return renderReport("weekly", weekStart, now, withNarrative, theme);
}

function logo(): MailMessage["inline"] {
  const file = path.join(process.cwd(), "public", "vcn-logo.png");
  if (!fs.existsSync(file)) return [];
  return [{ cid: LOGO_CID, filename: "vcn-logo.png", contentType: "image/png", data: fs.readFileSync(file) }];
}

/** The logo, every rep photo the HTML references (public/reps), and the trend charts, each as an inline cid: image. */
function inlineImages(data: WeeklyReportData, charts: ChartImage[]): MailMessage["inline"] {
  const out = logo() ?? [];
  for (const c of charts) out.push({ cid: c.cid, filename: c.filename, contentType: c.contentType, data: c.data });
  for (const a of repPhotoAssets(data)) {
    const file = path.join(process.cwd(), "public", a.publicPath.replace(/^\/+/, ""));
    if (!fs.existsSync(file)) continue;
    const ext = path.extname(file).toLowerCase();
    out.push({ cid: a.cid, filename: path.basename(file), contentType: ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg", data: fs.readFileSync(file) });
  }
  return out;
}

export interface SendOutcome {
  ok: boolean;
  report: ReportKind;
  weekStart: string;
  recipients: string[];
  attempts: number;
  messageId: string | null;
  error: string | null;
  narrative: boolean;
  narrativeSkipped?: string;
  durationMs: number;
}

/** The send-log kind for a report and trigger. */
export function sendKind(report: ReportKind, kind: "scheduled" | "test"): WeeklyReportSendKind {
  if (report === "midweek") return kind === "scheduled" ? "midweek" : "midweek-test";
  return kind;
}

/**
 * Sends one report. `kind` "scheduled" claims the week's single slot for that
 * report first and does nothing when it is already taken; "test" always
 * sends (to the addresses given) and is logged as a test. SMTP failures are
 * retried once.
 */
export async function sendWeeklyReport(opts: { report?: ReportKind; weekStart: Date; now: Date; kind: "scheduled" | "test"; to: string[]; triggeredBy: string; withNarrative?: boolean; theme?: ReportTheme }): Promise<SendOutcome | { skipped: string }> {
  const cfg = weeklyReportConfig();
  const report: ReportKind = opts.report ?? "weekly";
  const key = weekKeyOf(opts.weekStart);
  const logKind = sendKind(report, opts.kind);
  const t0 = Date.now();
  const id = claimWeeklyReportSend(key, logKind, opts.to, opts.triggeredBy);
  if (id === null) return { skipped: `the ${key} week already has a ${report === "midweek" ? "midweek" : "scheduled"} send row (sent, failed, or in progress)` };
  let attempts = 0;
  let narrative = false;
  let narrativeSkipped: string | undefined;
  let messageId: string | null = null;
  let error: string | null = null;
  try {
    const smtp = gmailConfigured();
    if (!smtp.ok) throw new Error(`${smtp.reason}; the report was built but not sent`);
    const r = await renderReport(report, opts.weekStart, opts.now, opts.withNarrative !== false, opts.theme);
    narrative = r.narrative !== null;
    narrativeSkipped = r.narrativeSkipped;
    const msg: MailMessage = { from: cfg.from, to: opts.to, subject: opts.kind === "test" ? `[TEST] [${r.theme}] ${r.subject} · sent ${fmtDateTime(opts.now)}` : r.subject, text: r.text, html: r.html, inline: inlineImages(r.data, r.charts) };
    for (attempts = 1; attempts <= 2; attempts++) {
      try {
        const res = await sendGmail(msg);
        messageId = res.messageId;
        error = null;
        console.log(`[weekly-report] ${logKind} send for week ${key} accepted (${res.response}) after ${attempts} attempt(s); narrative ${narrative ? "included" : `omitted: ${narrativeSkipped ?? "unknown"}`}`);
        break;
      } catch (e) {
        error = (e as Error).message;
        console.error(`[weekly-report] ${logKind} send for week ${key}, attempt ${attempts} failed: ${error}`);
        if (attempts === 1) await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
      }
    }
    attempts = Math.min(attempts, 2);
  } catch (e) {
    error = (e as Error).message;
    console.error(`[weekly-report] ${logKind} send for week ${key} could not be built: ${error}`);
  }
  const ok = messageId !== null;
  finishWeeklyReportSend(id, { ok, attempts, narrative, messageId, error: ok ? (narrativeSkipped ? `Sent; narrative omitted: ${narrativeSkipped}` : null) : error });
  return { ok, report, weekStart: key, recipients: opts.to, attempts, messageId, error, narrative, narrativeSkipped, durationMs: Date.now() - t0 };
}

let busy = false;
let devNoticeShown = false;

/**
 * Scheduler tick (every minute). Sends whichever report's send time has
 * arrived (the Sunday report for the week just ended, the Wednesday
 * check-in for the week in progress), once each, when that schedule is
 * enabled, the recipients are configured, and a sync has completed. Safe to
 * call often.
 */
export async function maybeSendScheduledReport(now: Date): Promise<void> {
  if (busy) return;
  // Only the production host sends on schedule: a dev server on a PC has its own cache (so its own
  // once-per-week guard) and would otherwise send a second copy. WEEKLY_REPORT_SCHEDULER=1 overrides.
  if (process.env.NODE_ENV !== "production" && process.env.WEEKLY_REPORT_SCHEDULER !== "1") {
    if (!devNoticeShown) {
      devNoticeShown = true;
      console.log("[weekly-report] scheduled sends are off outside production (set WEEKLY_REPORT_SCHEDULER=1 to enable here); previews and test sends still work.");
    }
    return;
  }
  busy = true;
  try {
    abandonStaleWeeklyReportSends(ABANDON_AFTER_MS);
    const cfg = weeklyReportConfig();
    const due: { report: ReportKind; weekStart: Date }[] = [];
    if (cfg.enabled) {
      const ws = dueWeekStart(now, cfg);
      if (ws) due.push({ report: "weekly", weekStart: ws });
    }
    if (cfg.midweek.enabled) {
      const ws = dueWeekStart(now, cfg.midweek);
      if (ws) due.push({ report: "midweek", weekStart: ws });
    }
    if (due.length === 0) return;
    if (cfg.recipients.length === 0) {
      console.warn("[weekly-report] a schedule is enabled but config/weekly-report.json has no recipients; nothing sent.");
      return;
    }
    if (!getState("last_core_sync_ok_at")) {
      console.warn("[weekly-report] no completed sync yet; the scheduled send waits for one.");
      return;
    }
    for (const job of due) {
      const r = await sendWeeklyReport({ report: job.report, weekStart: job.weekStart, now, kind: "scheduled", to: cfg.recipients, triggeredBy: "scheduler" });
      if ("skipped" in r) continue; // already handled for this week
    }
  } catch (e) {
    console.error("[weekly-report] scheduler tick failed:", (e as Error).message);
  } finally {
    busy = false;
  }
}
