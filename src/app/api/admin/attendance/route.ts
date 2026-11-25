// POST /api/admin/attendance
//   { "userId": "<GHL user id>", "day": "YYYY-MM-DD", "kind": "pto" | "sick" | "holiday" | "other", "note": "…" }  sets an override (the day is paid)
//   { "userId": "<GHL user id>", "day": "YYYY-MM-DD", "action": "clear" }                                          removes it
// Every change is logged in attendance_override_log and shown to the rep on
// their attendance calendar. Admins only; the dashboard's own cache, never
// GHL. A day on an invoice already sent is refused: sent invoices never
// change.

import { NextResponse } from "next/server";
import { isDenied, requireAdminApi } from "@/lib/guard";
import { clearOverride, OVERRIDE_KINDS, setOverride, type OverrideKind } from "@/lib/payroll/attendance";
import { periodContaining } from "@/lib/payroll/periods";
import { payrollInvoiceFor } from "@/lib/payroll/store";
import { salesReps } from "@/lib/reps";
import { parseNyDay } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireAdminApi();
  if (isDenied(user)) return user;
  try {
    const body = (await req.json()) as { userId?: unknown; day?: unknown; kind?: unknown; note?: unknown; action?: unknown };
    const rep = typeof body.userId === "string" ? salesReps.find((r) => r.userId === body.userId) : undefined;
    if (!rep) throw new Error('"userId" must be a configured rep');
    if (typeof body.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.day) || !parseNyDay(body.day)) throw new Error('"day" (YYYY-MM-DD) is required');
    const now = new Date();
    const period = periodContaining(parseNyDay(body.day) as Date, now);
    if (period && payrollInvoiceFor(rep.userId, "base", period.key)) return NextResponse.json({ ok: false, error: `${rep.name}'s base invoice for ${period.label} was already sent; a sent invoice never changes.` }, { status: 409 });
    if (body.action === "clear") {
      const removed = clearOverride(rep.userId, body.day, user.email);
      return NextResponse.json({ ok: true, message: removed ? `Override removed for ${rep.name} on ${body.day}.` : `No override on ${body.day} to remove.` });
    }
    if (typeof body.kind !== "string" || !OVERRIDE_KINDS.includes(body.kind as OverrideKind)) throw new Error('"kind" must be pto, sick, holiday, or other');
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
    setOverride(rep.userId, body.day, body.kind as OverrideKind, note, user.email);
    console.log(`[payroll] ${user.email} set attendance override ${rep.name} ${body.day} ${body.kind}`);
    return NextResponse.json({ ok: true, message: `${rep.name} · ${body.day} marked ${body.kind}${note ? ` (${note})` : ""}; the day is paid and the rep sees the note.` });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}
