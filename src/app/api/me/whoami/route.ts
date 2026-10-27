// GET /api/me/whoami — who the server thinks the caller is: email, role, and
// (for a rep) the GHL user id their figures are credited to. Handy for
// checking a new rep's sign-in before they see anything. Returns only the
// caller's own identity; never anyone else's.

import { NextResponse } from "next/server";
import { isDenied, requireApiUser } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  return NextResponse.json({ ok: true, email: user.email, role: user.role, repUserId: user.repUserId, name: user.name });
}
