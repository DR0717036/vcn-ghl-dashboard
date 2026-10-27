// POST /api/admin/invoices  body { "id": <invoice id>, "action": "approve" | "paid" }
// Approve: records the signed-in approver's approval; the invoice becomes
// Approved once every approver in config/invoices.json has approved. Paid:
// marks an Approved invoice paid. The rep is emailed at each change. Admins
// only; writes only to the dashboard's own cache.

import { NextResponse } from "next/server";
import { isDenied, requireAdminApi } from "@/lib/guard";
import { approveInvoice, markInvoicePaid } from "@/lib/invoices/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireAdminApi();
  if (isDenied(user)) return user;
  try {
    const body = (await req.json()) as { id?: unknown; action?: unknown };
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error('"id" is required');
    if (body.action !== "approve" && body.action !== "paid") throw new Error('"action" must be approve or paid');
    const r = body.action === "approve" ? await approveInvoice(id, user.email) : await markInvoicePaid(id, user.email);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 409 });
    console.log(`[invoices] ${user.email} ${body.action}: ${r.invoice.number} → ${r.invoice.status}`);
    return NextResponse.json({ ok: true, message: r.message, status: r.invoice.status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}
