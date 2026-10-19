// Runs before every request (Next.js 16 "proxy", formerly middleware). No
// session: API calls get 401 JSON, pages go to /login. Only the login page,
// the Auth.js endpoints, Next's own assets, and the logo / rep photos are
// open. Pages and routes check again themselves (src/lib/guard.ts).

import { NextResponse } from "next/server";
import { auth } from "@/auth";

const OPEN_PAGES = new Set(["/login"]);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (OPEN_PAGES.has(pathname) || pathname.startsWith("/api/auth/")) return NextResponse.next();
  const email = req.auth?.user?.email;
  if (email) return NextResponse.next();
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
