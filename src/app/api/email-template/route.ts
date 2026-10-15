// GET /api/email-template?template=<key>&range=… — one email template
// cluster's stats, daily sends, and a sandboxed preview. Reads the local
// cache plus read-only GETs to GHL (email builder list, a template's preview
// HTML, one narrow message export for the subject). Returns message content,
// so it is disabled in production until login exists, like the other routes.

import { NextResponse } from "next/server";
import { isRangeKey, resolveRange } from "@/lib/dates";
import { emailTemplateDrilldown, sanitizeEmailHtml } from "@/lib/emailTemplate";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Email previews are disabled in production until login is configured." }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const rangeParam = sp.get("range") ?? undefined;
  const range = resolveRange(isRangeKey(rangeParam) ? rangeParam : "this_month", new Date(), { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const key = sp.get("template") ?? "";
  if (!key) return NextResponse.json({ ok: false, error: "Missing template key." }, { status: 400 });
  try {
    const d = await emailTemplateDrilldown(key, range);
    if (!d) return NextResponse.json({ ok: false, error: "Unknown template." }, { status: 404 });
    if (d.preview.html) d.preview.html = sanitizeEmailHtml(d.preview.html);
    return NextResponse.json(d);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
