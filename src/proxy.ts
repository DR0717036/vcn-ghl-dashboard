// Runs before every request (Next.js 16 "proxy", formerly middleware). No
// session: API calls get 401 JSON, pages go to /login. Only the login page,
// the Auth.js endpoints, Next's own assets, and the logo / rep photos are
// open. Signed-in reps may only reach their own pages (/me, /invoices) and
// the routes under /api/me; everything else sends them to /me (pages) or a
// 403 (API). Pages and routes check again themselves (src/lib/guard.ts).

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { roleFor } from "@/lib/users";

const OPEN_PAGES = new Set(["/login"]);

/** Paths a rep may open. Admins may open everything. */
function repMayOpen(pathname: string): boolean {
  if (pathname === "/me" || pathname.startsWith("/me/")) return true;
  if (pathname === "/invoices" || pathname.startsWith("/invoices/")) return true;
  if (pathname.startsWith("/api/me/")) return true;
  return false;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (OPEN_PAGES.has(pathname) || pathname.startsWith("/api/auth/")) return NextResponse.next();
  const email = req.auth?.user?.email;
  const role = roleFor(email);
  if (email && role === "admin") return NextResponse.next();
  if (email && role === "rep") {
    if (repMayOpen(pathname)) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "This route is for admins only." }, { status: 403 });
    return NextResponse.redirect(new URL("/me", req.nextUrl.origin));
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  const login = new URL("/login", req.nextUrl.origin);
  login.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
});

export const config = {
  // Everything except Next internals, the favicon, the logo, and rep photos.
  matcher: ["/((?!_next/|favicon\.ico|vcn-logo\.png|reps/).*)"],
};
