// POST /api/me/invoices  body { "month": "YYYY-MM" } — the signed-in rep
// sends that month's invoice for review (freezes it, renders the PDF, emails
// the reviewers). Reps only: an admin viewing as a rep cannot send on their
// behalf. Writes only to the dashboard's own cache; never GHL.

import { NextResponse } from "next/server";
import { isDenied, requireApiUser } from "@/lib/guard";
import { submitInvoice } from "@/lib/invoices/service";
import { salesReps } from "@/lib/reps";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  if (user.role !== "rep") return NextResponse.json({ ok: false, error: "Only the rep can send their own invoice for review." }, { status: 403 });
  const rep = salesReps.find((r) => r.userId === user.repUserId);
  if (!rep) return NextResponse.json({ ok: false, error: "Your sign-in is not linked to a rep." }, { status: 403 });
  try {
    const body = (await req.json()) as { month?: unknown };
    if (typeof body.month !== "string" || !/^\d{4}-\d{2}$/.test(body.month)) throw new Error('"month" (YYYY-MM) is required');
    const r = await submitInvoice(rep, body.month, user.email, new Date());
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 409 });
    console.log(`[invoices] ${user.email} sent ${r.invoice.number} (${r.invoice.month}) for review`);
    return NextResponse.json({ ok: true, message: r.message, id: r.invoice.id, number: r.invoice.number });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}
