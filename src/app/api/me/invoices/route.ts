// POST /api/me/invoices  body { "type": "base" | "commission", "key": "<period start YYYY-MM-DD | YYYY-MM>" }
// The signed-in rep sends that invoice: freezes the lines, assigns the
// number, renders the PDF, emails it, stores it as Submitted. Reps only: an
// admin viewing as a rep cannot send on their behalf. Writes only to the
// dashboard's own cache; never GHL.

import { NextResponse } from "next/server";
import { isDenied, requireApiUser } from "@/lib/guard";
import { sendInvoice } from "@/lib/payroll/invoices";
import { salesReps } from "@/lib/reps";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  if (user.role !== "rep") return NextResponse.json({ ok: false, error: "Only the rep can send their own invoice." }, { status: 403 });
  const rep = salesReps.find((r) => r.userId === user.repUserId);
  if (!rep) return NextResponse.json({ ok: false, error: "Your sign-in is not linked to a rep." }, { status: 403 });
  try {
    const body = (await req.json()) as { type?: unknown; key?: unknown };
    const type = body.type === "base" || body.type === "commission" ? body.type : null;
    if (!type) throw new Error('"type" must be base or commission');
    if (typeof body.key !== "string" || !(type === "base" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/).test(body.key)) throw new Error(`"key" (${type === "base" ? "YYYY-MM-DD" : "YYYY-MM"}) is required`);
    const r = await sendInvoice(rep, type, body.key, user.email, new Date());
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 409 });
    console.log(`[payroll] ${user.email} sent ${r.invoice.number}`);
    return NextResponse.json({ ok: true, message: r.message, id: r.invoice.id, number: r.invoice.number });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}
