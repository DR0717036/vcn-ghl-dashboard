// GET /api/me/invoices/pdf?id=<invoice id> — the stored PDF of a submitted
// invoice. A rep can only download their own; admins any.

import { NextResponse } from "next/server";
import { isDenied, requireApiUser } from "@/lib/guard";
import { invoiceById, invoicePdf } from "@/lib/invoices/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  const id = Number(new URL(req.url).searchParams.get("id"));
  const inv = Number.isFinite(id) && id > 0 ? invoiceById(id) : null;
  if (!inv) return NextResponse.json({ ok: false, error: "Unknown invoice." }, { status: 404 });
  if (user.role === "rep" && inv.userId !== user.repUserId) return NextResponse.json({ ok: false, error: "Not your invoice." }, { status: 403 });
  const pdf = invoicePdf(inv.id);
  if (!pdf) return NextResponse.json({ ok: false, error: "No PDF is stored for this invoice." }, { status: 404 });
  return new NextResponse(new Uint8Array(pdf.data), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.name.replace(/["\r\n]/g, "")}"`, "Cache-Control": "private, no-store" } });
}
