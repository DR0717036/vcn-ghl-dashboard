// Sign in with Google (Auth.js). Only admins (config/users.json) and sales
// reps with a signInEmail (config/sales-reps.json) may sign in; everyone else
// is refused before a session is ever created, so there is nothing to sign
// out of. Sessions are signed cookies (JWT) that last 30 days. The role is
// never stored in the cookie: it is looked up from the config files on every
// request, so removing an address or changing a role takes effect at once.
// Nothing here touches Go High Level.
//
// Secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET) are read by
// Auth.js from .env automatically. Never log them.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail, repForEmail, roleFor, type Role } from "@/lib/users";

const THIRTY_DAYS = 30 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js would otherwise look for AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET; the owner asked for these names.
  providers: [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })],
  trustHost: true,
  session: { strategy: "jwt", maxAge: THIRTY_DAYS },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Runs once at sign-in. Returning false sends the visitor to /login?error=AccessDenied.
    signIn({ profile }) {
      const p = profile as { email?: string; email_verified?: boolean } | undefined;
      return Boolean(p?.email_verified) && isAllowedEmail(p?.email);
    },
    // Runs on every request that reads the session: re-check the allow-lists
    // so removing an address from the config takes effect at once.
    session({ session }) {
      if (!isAllowedEmail(session.user?.email)) {
        return { ...session, user: { ...session.user, email: "", name: "", image: null } };
      }
      return session;
    },
  },
});

export interface SignedInUser {
  name: string;
  email: string;
  image: string | null;
  role: Role;
  /** For a rep: their GHL user id (the key every per-rep figure is credited to). Null for admins. */
  repUserId: string | null;
}

/** The signed-in, allow-listed user with their role, or null. */
export async function currentUser(): Promise<SignedInUser | null> {
  const session = await auth();
  const email = session?.user?.email;
  const role = roleFor(email);
  if (!email || !role) return null;
  const rep = role === "rep" ? repForEmail(email) : null;
  return { name: session.user?.name || email, email, image: session.user?.image ?? null, role, repUserId: rep?.userId ?? null };
}
