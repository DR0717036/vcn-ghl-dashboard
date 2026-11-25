// GET  /api/admin/payroll-summary            — the monthly "invoices due" summary as it would be sent now (HTML; &format=text for the plain version)
// POST /api/admin/payroll-summary  { "to": "one@address" } — sends a test copy ([TEST] subject) to one address, which must be an admin or configured recipient
// Admins only. Never GHL.

import { NextResponse } from "next/server";
import { isDenied, requireAdminApi } from "@/lib/guard";
import { monthlySummary, monthlySummaryHtml, nextSummaryAt, sendMonthlySummary } from "@/lib/payroll/admin";
import { payrollConfig } from "@/lib/payroll/config";
import { adminEmails } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireAdminApi();
  if (isDenied(user)) return user;
  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const m = monthlySummaryHtml(monthlySummary(now));
  if (sp.get("format") === "text") return new NextResponse(`Subject: ${m.subject}\nNext scheduled send: ${nextSummaryAt(now)}\nTo: ${payrollConfig().monthlySummary.to.join(", ")}\n\n${m.text}`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new NextResponse(m.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireAdminApi();
  if (isDenied(user)) return user;
  try {
    const body = (await req.json()) as { to?: unknown };
    const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    const allowed = new Set([...adminEmails(), ...payrollConfig().monthlySummary.to, ...payrollConfig().recipients.to, ...payrollConfig().recipients.cc]);
    if (!to || !allowed.has(to)) throw new Error('"to" must be one admin or configured recipient address');
    const r = await sendMonthlySummary(new Date(), [to]);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.detail }, { status: 502 });
    return NextResponse.json({ ok: true, message: `Test summary sent to ${to}: ${r.subject}` });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}
