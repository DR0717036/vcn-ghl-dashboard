// Sign in with Google (Auth.js). Only the addresses in config/users.json may
// sign in; everyone else is refused before a session is ever created, so
// there is nothing to sign out of. Sessions are signed cookies (JWT) that
// last 30 days. Nothing here touches Go High Level.
//
// Secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET) are read by
// Auth.js from .env automatically. Never log them.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail } from "@/lib/users";

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
    // Runs on every request that reads the session: re-check the allow-list
    // so removing an address from config/users.json takes effect at once.
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
}

/** The signed-in, allow-listed user, or null. */
export async function currentUser(): Promise<SignedInUser | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAllowedEmail(email)) return null;
  return { name: session.user?.name || email, email, image: session.user?.image ?? null };
}
