// Builds and sends the weekly sales report email, and decides when the
// scheduled Sunday send is due. Idempotent: the cache keeps one scheduled
// row per report week (unique index), claimed BEFORE the send starts, so a
// restart or redeploy cannot send the same week twice. SMTP is retried once.
// Every attempt, scheduled or test, is logged for the Mapping page. Reads
// the local cache only; never GHL. Never logs credentials.

import fs from "node:fs";
import path from "node:path";
import { abandonStaleWeeklyReportSends, claimWeeklyReportSend, finishWeeklyReportSend, getState } from "@/lib/db";
import { fmtDateTime, fmtRangeShort } from "@/lib/dates";
import { gmailConfigured, sendGmail, type MailMessage } from "@/lib/mailer";
import { dueWeekStart, weekKeyOf, weekRange, weeklyReportConfig, type ReportTheme } from "./config";
import { renderTrendCharts, type ChartImage } from "./charts";
import { buildWeeklyReport, type WeeklyReportData } from "./data";
import { generateNarrative, type Narrative } from "./narrative";
import { LOGO_CID, renderHtml, renderText, repPhotoAssets } from "./render";

const RETRY_DELAY_MS = 20_000;
const ABANDON_AFTER_MS = 30 * 60 * 1000;

export interface Rendered {
  data: WeeklyReportData;
  narrative: Narrative | null;
  narrativeSkipped?: string;
  narrativeMs: number;
  subject: string;
  theme: ReportTheme;
  /** The trend charts (PNG) the HTML references as cid: images. */
  charts: ChartImage[];
  html: string;
  text: string;
}

/** Computes the report and renders both parts; `withNarrative` false skips the Anthropic call (cheap preview). `theme` overrides config/weekly-report.json (previews and tests). */
export async function renderWeeklyReport(weekStart: Date, now: Date, withNarrative: boolean, theme?: ReportTheme): Promise<Rendered> {
  const cfg = weeklyReportConfig();
  const useTheme = theme ?? cfg.theme;
  const data = buildWeeklyReport(weekStart, now);
  const outcome = withNarrative ? await generateNarrative(data) : { narrative: null, skipped: "narrative not requested", durationMs: 0 };
  let charts: ChartImage[] = [];
  try {
    charts = await renderTrendCharts(data, useTheme);
  } catch (e) {
    // The email still goes out; section 6 falls back to its caption rows.
    console.warn(`[weekly-report] trend charts skipped: ${(e as Error).message}`);
  }
  const r = weekRange(weekStart, now);
  // The range (with the year) makes every week's subject distinct, so Gmail does not thread the reports together and trim repeated sections.
  const subject = cfg.subject.replace("{range}", fmtRangeShort(r.start, r.end, true));
  return { data, narrative: outcome.narrative, narrativeSkipped: outcome.skipped, narrativeMs: outcome.durationMs, subject, theme: useTheme, charts, html: renderHtml(data, outcome.narrative, useTheme, charts), text: renderText(data, outcome.narrative) };
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
  weekStart: string;
  recipients: string[];
  attempts: number;
  messageId: string | null;
  error: string | null;
  narrative: boolean;
  narrativeSkipped?: string;
  durationMs: number;
}

/**
 * Sends one report. `kind` "scheduled" claims the week's single slot first
 * and does nothing when it is already taken; "test" always sends (to the
 * addresses given) and is logged as a test. SMTP failures are retried once.
 */
export async function sendWeeklyReport(opts: { weekStart: Date; now: Date; kind: "scheduled" | "test"; to: string[]; triggeredBy: string; withNarrative?: boolean; theme?: ReportTheme }): Promise<SendOutcome | { skipped: string }> {
  const cfg = weeklyReportConfig();
  const key = weekKeyOf(opts.weekStart);
  const t0 = Date.now();
  const id = claimWeeklyReportSend(key, opts.kind, opts.to, opts.triggeredBy);
  if (id === null) return { skipped: `the ${key} week already has a scheduled send row (sent, failed, or in progress)` };
  let attempts = 0;
  let narrative = false;
  let narrativeSkipped: string | undefined;
  let messageId: string | null = null;
  let error: string | null = null;
  try {
    const smtp = gmailConfigured();
    if (!smtp.ok) throw new Error(`${smtp.reason}; the report was built but not sent`);
    const r = await renderWeeklyReport(opts.weekStart, opts.now, opts.withNarrative !== false, opts.theme);
    narrative = r.narrative !== null;
    narrativeSkipped = r.narrativeSkipped;
    const msg: MailMessage = { from: cfg.from, to: opts.to, subject: opts.kind === "test" ? `[TEST] [${r.theme}] ${r.subject} · sent ${fmtDateTime(opts.now)}` : r.subject, text: r.text, html: r.html, inline: inlineImages(r.data, r.charts) };
    for (attempts = 1; attempts <= 2; attempts++) {
      try {
        const res = await sendGmail(msg);
        messageId = res.messageId;
        error = null;
        console.log(`[weekly-report] ${opts.kind} send for week ${key} accepted (${res.response}) after ${attempts} attempt(s); narrative ${narrative ? "included" : `omitted: ${narrativeSkipped ?? "unknown"}`}`);
        break;
      } catch (e) {
        error = (e as Error).message;
        console.error(`[weekly-report] ${opts.kind} send for week ${key}, attempt ${attempts} failed: ${error}`);
        if (attempts === 1) await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
      }
    }
    attempts = Math.min(attempts, 2);
  } catch (e) {
    error = (e as Error).message;
    console.error(`[weekly-report] ${opts.kind} send for week ${key} could not be built: ${error}`);
  }
  const ok = messageId !== null;
  finishWeeklyReportSend(id, { ok, attempts, narrative, messageId, error: ok ? (narrativeSkipped ? `Sent; narrative omitted: ${narrativeSkipped}` : null) : error });
  return { ok, weekStart: key, recipients: opts.to, attempts, messageId, error, narrative, narrativeSkipped, durationMs: Date.now() - t0 };
}

let busy = false;

/**
 * Scheduler tick (every minute). Sends the report for the week whose send
 * time has arrived, once, when the schedule is enabled, the recipients are
 * configured, and a sync has completed. Safe to call often.
 */
export async function maybeSendScheduledReport(now: Date): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    abandonStaleWeeklyReportSends(ABANDON_AFTER_MS);
    const cfg = weeklyReportConfig();
    if (!cfg.enabled) return;
    const weekStart = dueWeekStart(now, cfg);
    if (!weekStart) return;
    if (cfg.recipients.length === 0) {
      console.warn("[weekly-report] schedule is enabled but config/weekly-report.json has no recipients; nothing sent.");
      return;
    }
    if (!getState("last_core_sync_ok_at")) {
      console.warn("[weekly-report] no completed sync yet; the scheduled send waits for one.");
      return;
    }
    const r = await sendWeeklyReport({ weekStart, now, kind: "scheduled", to: cfg.recipients, triggeredBy: "scheduler" });
    if ("skipped" in r) return; // already handled for this week
  } catch (e) {
    console.error("[weekly-report] scheduler tick failed:", (e as Error).message);
  } finally {
    busy = false;
  }
}
