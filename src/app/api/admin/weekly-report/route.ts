// Weekly report and midweek check-in: preview, test send, and a host check.
// Same auth as import-history: a signed-in user listed under
// historyImportAdmins in config/users.json.
//
// GET  /api/admin/weekly-report?report=weekly|midweek&week=YYYY-MM-DD&format=html|text|json&narrative=0|1&theme=light|dark
//      Renders the report for the week containing that date (default: the
//      last completed week for the Sunday report, the current week for the
//      check-in) in the browser. narrative=1 (default) includes the
//      Anthropic-written parts; 0 skips the API call for a quick look.
// GET  ... &asOf=<ISO instant> renders the preview as if it were that moment (e.g. a Wednesday
//      3 PM for the check-in); previews only, never sends.
// GET  /api/admin/weekly-report?action=check
//      Confirms on this host, without sending anything: Gmail accepts the
//      credentials, the Anthropic key and model answer, both schedules and
//      their next send times, and the once-per-week guard (a rolled-back
//      double insert).
// POST /api/admin/weekly-report  body { "report": "weekly"|"midweek", "week": "YYYY-MM-DD", "to": "one@address", "theme": "light"|"dark" }
//      Sends a test copy (subject prefixed [TEST]) to ONE address, which must
//      be a configured recipient or an allowed sign-in address. Logged on
//      the Mapping page like every send. Never touches the schedules.
// Reads the local cache only; never GHL.

import { NextResponse } from "next/server";
import { latestWeeklyReportSends, weeklyReportIdempotencyProbe } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { isDenied, requireApiUser } from "@/lib/guard";
import { verifyGmail } from "@/lib/mailer";
import { allowedEmails, isHistoryImportAdmin } from "@/lib/users";
import { nextScheduledInstant, scheduleLabel, weekStartFromKey, weeklyReportConfig, type ReportTheme } from "@/lib/weeklyReport/config";
import { checkAnthropic } from "@/lib/weeklyReport/narrative";
import { repPhotoAssets } from "@/lib/weeklyReport/render";
import { defaultWeekStart, renderReport, sendWeeklyReport, type ReportKind } from "@/lib/weeklyReport/send";

export const dynamic = "force-dynamic";

async function admin(): Promise<{ email: string } | NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  if (!isHistoryImportAdmin(user.email)) return NextResponse.json({ ok: false, error: "Only an address listed under historyImportAdmins in config/users.json may use the weekly report route." }, { status: 403 });
  return { email: user.email };
}

function reportFrom(v: unknown): ReportKind {
  if (v === undefined || v === null || v === "" || v === "weekly") return "weekly";
  if (v === "midweek") return "midweek";
  throw new Error('"report" must be "weekly" or "midweek"');
}

function weekFrom(raw: string | null | undefined, report: ReportKind, now: Date): Date {
  if (raw && !weekStartFromKey(raw)) throw new Error('"week" must be a date written YYYY-MM-DD');
  return weekStartFromKey(raw) ?? defaultWeekStart(report, now);
}

/** ?theme= / body.theme: light or dark; absent = the theme in config/weekly-report.json. */
function themeFrom(v: unknown): ReportTheme | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (v === "light" || v === "dark") return v;
  throw new Error('"theme" must be "light" or "dark"');
}

async function hostCheck(now: Date) {
  const cfg = weeklyReportConfig();
  const [gmail, anthropic] = await Promise.all([verifyGmail(), checkAnthropic()]);
  const guard = weeklyReportIdempotencyProbe();
  const sched = (s: { enabled: boolean; sendTime: { weekday: number; hour: number; minute: number }; catchUpHours: number }) => {
    const next = nextScheduledInstant(now, s);
    return { enabled: s.enabled, schedule: scheduleLabel(s), next: s.enabled ? fmtDateTime(next) : null, nextIso: s.enabled ? next.toISOString() : null };
  };
  const sends = latestWeeklyReportSends(6).map((r) => ({ week: r.week_start, kind: r.kind, started: r.started_at, ok: r.ok, error: r.error }));
  return {
    ok: gmail.ok && anthropic.ok && guard.ok,
    checkedAt: now.toISOString(),
    gmail,
    anthropic,
    guard,
    schedules: { weekly: sched(cfg), midweek: sched(cfg.midweek) },
    recipients: cfg.recipients,
    theme: cfg.theme,
    recentSends: sends,
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const user = await admin();
  if (isDenied(user)) return user;
  const sp = new URL(req.url).searchParams;
  try {
    if (sp.get("action") === "check") return NextResponse.json(await hostCheck(new Date()));
    // asOf: preview the report as of another instant (never applies to sends)
    const asOf = sp.get("asOf");
    const now = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(now.getTime())) throw new Error("\"asOf\" must be an ISO date-time");
    const report = reportFrom(sp.get("report"));
    const weekStart = weekFrom(sp.get("week"), report, now);
    const format = sp.get("format") ?? "html";
    const r = await renderReport(report, weekStart, now, sp.get("narrative") !== "0", themeFrom(sp.get("theme")));
    if (format === "json") return NextResponse.json({ ok: true, report, subject: r.subject, theme: r.theme, narrative: r.narrative, narrativeSkipped: r.narrativeSkipped, data: r.data });
    if (format === "text") return new NextResponse(r.text, { headers: { "content-type": "text/plain; charset=utf-8" } });
    // The logo and rep photos are inline attachments in the email; in the browser preview they are served from the site.
    let html = r.html.replace(/src="cid:vcn-logo"/g, 'src="/vcn-logo.png"');
    for (const a of repPhotoAssets(r.data)) html = html.split('src="cid:' + a.cid + '"').join('src="' + a.publicPath + '"');
    // The trend charts exist only in memory; the preview carries them as data URIs (the email attaches them).
    for (const c of r.charts) html = html.split('src="cid:' + c.cid + '"').join('src="data:image/png;base64,' + c.data.toString("base64") + '"');
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "x-weekly-report-subject": encodeURIComponent(r.subject), "x-weekly-report-theme": r.theme, "x-weekly-report-narrative": r.narrative ? "included" : `omitted: ${encodeURIComponent(r.narrativeSkipped ?? "")}` } });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await admin();
  if (isDenied(user)) return user;
  const now = new Date();
  try {
    const body = (await req.json().catch(() => ({}))) as { report?: unknown; week?: unknown; to?: unknown; narrative?: unknown; theme?: unknown };
    const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    if (!to) throw new Error('"to" (one email address) is required');
    const cfg = weeklyReportConfig();
    if (!cfg.recipients.includes(to) && !allowedEmails().has(to)) throw new Error("the test address must be a configured recipient (config/weekly-report.json) or an allowed sign-in address (config/users.json)");
    const report = reportFrom(body.report);
    const weekStart = weekFrom(typeof body.week === "string" ? body.week : undefined, report, now);
    const r = await sendWeeklyReport({ report, weekStart, now, kind: "test", to: [to], triggeredBy: user.email, withNarrative: body.narrative !== false, theme: themeFrom(body.theme) });
    if ("skipped" in r) return NextResponse.json({ ok: false, error: r.skipped }, { status: 409 });
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}
