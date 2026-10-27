// Session guards. Pages call requirePageUser() (redirects to /login); API
// routes call requireApiUser() (401 JSON). Admin-only pages and routes call
// requireAdminPage() / requireAdminApi(): a signed-in rep is sent to /me or
// gets 403. src/proxy.ts does the same checks one layer earlier, so this is
// defense in depth: every route is protected even if a matcher is wrong. The
// 15-minute sync job runs from src/instrumentation.ts without any HTTP
// request, so it needs no session.

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { currentUser, type SignedInUser } from "@/auth";

export async function requirePageUser(callbackPath = "/"): Promise<SignedInUser> {
  const user = await currentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  return user;
}

export async function requireApiUser(): Promise<SignedInUser | NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  return user;
}

/** An admin, or a redirect: reps land on their own dashboard, visitors on the login page. */
export async function requireAdminPage(callbackPath = "/"): Promise<SignedInUser> {
  const user = await requirePageUser(callbackPath);
  if (user.role !== "admin") redirect("/me");
  return user;
}

export async function requireAdminApi(): Promise<SignedInUser | NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  if (user.role !== "admin") return NextResponse.json({ ok: false, error: "This route is for admins only." }, { status: 403 });
  return user;
}

export function isDenied(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
