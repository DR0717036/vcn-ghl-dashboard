// Weekly sales report: preview and test send. Same auth as import-history:
// a signed-in user listed under historyImportAdmins in config/users.json.
//
// GET  /api/admin/weekly-report?week=YYYY-MM-DD&format=html|text|json&narrative=0|1
//      Renders the report for the week containing that date (default: the
//      most recently completed Monday-to-Sunday week) in the browser.
//      narrative=1 (default) includes the Anthropic-written parts; 0 skips
//      the API call for a quick numbers-only look.
// POST /api/admin/weekly-report  body { "week": "YYYY-MM-DD", "to": "one@address" }
//      Sends a test copy (subject prefixed [TEST]) to ONE address, which must
//      be a configured recipient or an allowed sign-in address. Logged on
//      the Mapping page like every send. Never touches the Sunday schedule.
// Reads the local cache only; never GHL.

import { NextResponse } from "next/server";
import { isDenied, requireApiUser } from "@/lib/guard";
import { allowedEmails, isHistoryImportAdmin } from "@/lib/users";
import { lastCompletedWeekStart, weekStartFromKey, weeklyReportConfig } from "@/lib/weeklyReport/config";
import { renderWeeklyReport, sendWeeklyReport } from "@/lib/weeklyReport/send";

export const dynamic = "force-dynamic";

async function admin(): Promise<{ email: string } | NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  if (!isHistoryImportAdmin(user.email)) return NextResponse.json({ ok: false, error: "Only an address listed under historyImportAdmins in config/users.json may use the weekly report route." }, { status: 403 });
  return { email: user.email };
}

function weekFrom(raw: string | null | undefined, now: Date): Date {
  if (raw && !weekStartFromKey(raw)) throw new Error('"week" must be a date written YYYY-MM-DD');
  return weekStartFromKey(raw) ?? lastCompletedWeekStart(now);
}

export async function GET(req: Request): Promise<NextResponse> {
  const user = await admin();
  if (isDenied(user)) return user;
  const now = new Date();
  const sp = new URL(req.url).searchParams;
  try {
    const weekStart = weekFrom(sp.get("week"), now);
    const format = sp.get("format") ?? "html";
    const r = await renderWeeklyReport(weekStart, now, sp.get("narrative") !== "0");
    if (format === "json") return NextResponse.json({ ok: true, subject: r.subject, narrative: r.narrative, narrativeSkipped: r.narrativeSkipped, data: r.data });
    if (format === "text") return new NextResponse(r.text, { headers: { "content-type": "text/plain; charset=utf-8" } });
    // The logo is an inline attachment in the email; in the browser preview it is served from the site.
    const html = r.html.replace(/src="cid:vcn-logo"/g, 'src="/vcn-logo.png"');
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "x-weekly-report-subject": encodeURIComponent(r.subject), "x-weekly-report-narrative": r.narrative ? "included" : `omitted: ${encodeURIComponent(r.narrativeSkipped ?? "")}` } });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await admin();
  if (isDenied(user)) return user;
  const now = new Date();
  try {
    const body = (await req.json().catch(() => ({}))) as { week?: unknown; to?: unknown; narrative?: unknown };
    const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    if (!to) throw new Error('"to" (one email address) is required');
    const cfg = weeklyReportConfig();
    if (!cfg.recipients.includes(to) && !allowedEmails().has(to)) throw new Error("the test address must be a configured recipient (config/weekly-report.json) or an allowed sign-in address (config/users.json)");
    const weekStart = weekFrom(typeof body.week === "string" ? body.week : undefined, now);
    const r = await sendWeeklyReport({ weekStart, now, kind: "test", to: [to], triggeredBy: user.email, withNarrative: body.narrative !== false });
    if ("skipped" in r) return NextResponse.json({ ok: false, error: r.skipped }, { status: 409 });
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}
