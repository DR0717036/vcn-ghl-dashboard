// GET /api/me/invoices/preview?type=base|commission&key=<period>[&as=<GHL user id>]
// The PDF of an invoice as it stands now, rendered on the fly and never
// stored or emailed: a rep previews their own draft; an admin previews any
// rep's with ?as=. A sent invoice returns its stored PDF instead, so the
// preview always matches what was (or would be) sent. Never GHL.

import { NextResponse } from "next/server";
import { fmtDateTime } from "@/lib/dates";
import { isDenied, requireApiUser } from "@/lib/guard";
import { repForApi } from "@/lib/me/context";
import { payrollConfig } from "@/lib/payroll/config";
import { invoiceDraft } from "@/lib/payroll/invoices";
import { renderPayrollPdf } from "@/lib/payroll/pdf";
import { payrollInvoicePdf, TYPE_LABEL } from "@/lib/payroll/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  const sp = new URL(req.url).searchParams;
  const rep = repForApi(user, sp.get("as"));
  if (!rep) return NextResponse.json({ ok: false, error: user.role === "admin" ? "Pass ?as=<GHL user id> of a configured rep." : "Your sign-in is not linked to a rep." }, { status: 403 });
  const type = sp.get("type") === "base" ? "base" : sp.get("type") === "commission" ? "commission" : null;
  const key = sp.get("key") ?? "";
  if (!type || !key) return NextResponse.json({ ok: false, error: "type (base | commission) and key are required." }, { status: 400 });
  const now = new Date();
  const d = invoiceDraft(rep, type, key, now);
  if (!d) return NextResponse.json({ ok: false, error: "Unknown invoice period." }, { status: 404 });
  const headers = (name: string) => ({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name.replace(/["\r\n]/g, "")}"`, "Cache-Control": "private, no-store" });
  if (d.stored) {
    const pdf = payrollInvoicePdf(d.stored.id);
    if (pdf) return new NextResponse(new Uint8Array(pdf.data), { headers: headers(pdf.name) });
  }
  const cfg = payrollConfig();
  const pdf = renderPayrollPdf({
    number: d.number,
    title: type === "base" ? "Bi-weekly base pay invoice" : "Monthly commission invoice",
    typeLabel: TYPE_LABEL[type],
    status: d.stored ? "Submitted" : d.available ? "Draft (not sent)" : "Preview (period in progress)",
    repName: rep.name,
    periodLabel: `${d.label} · ${d.periodLabel}`,
    payer: cfg.payer,
    paymentTerms: cfg.paymentTerms,
    generatedAt: fmtDateTime(now),
    lines: d.lines,
    totals: d.totals,
    summary: d.summary,
    notes: d.notes,
  });
  return new NextResponse(new Uint8Array(pdf), { headers: headers(`${d.number}-preview.pdf`) });
}
