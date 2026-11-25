// GET /api/admin/invoices/csv?id=<invoice id>           — the line items of one sent invoice
// GET /api/admin/invoices/csv?rep=&type=&status=&period= — one row per invoice through the same filters as the page
// Admins only. Reads the dashboard's own cache; never GHL.

import { NextResponse } from "next/server";
import { isDenied, requireAdminApi } from "@/lib/guard";
import { adminInvoiceRows, invoiceLinesCsv, invoicesCsv, type AdminFilters } from "@/lib/payroll/admin";
import { payrollInvoiceById, type InvoiceType, type PayrollStatus } from "@/lib/payroll/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireAdminApi();
  if (isDenied(user)) return user;
  const sp = new URL(req.url).searchParams;
  const headers = (name: string) => ({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" });
  const id = Number(sp.get("id"));
  if (Number.isFinite(id) && id > 0) {
    const inv = payrollInvoiceById(id);
    if (!inv) return NextResponse.json({ ok: false, error: "Unknown invoice." }, { status: 404 });
    return new NextResponse(invoiceLinesCsv(inv), { headers: headers(`${inv.number}-lines.csv`) });
  }
  const f: AdminFilters = {
    rep: sp.get("rep") ?? undefined,
    type: (["base", "commission"].includes(sp.get("type") ?? "") ? sp.get("type") : "") as InvoiceType | "",
    status: (["draft", "submitted", "approved", "paid"].includes(sp.get("status") ?? "") ? sp.get("status") : "") as PayrollStatus | "",
    period: sp.get("period") ?? undefined,
  };
  const rows = adminInvoiceRows(new Date(), f);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(invoicesCsv(rows), { headers: headers(`vcn-invoices-${stamp}.csv`) });
}
