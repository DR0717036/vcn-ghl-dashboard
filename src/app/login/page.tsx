// Login page: dark background, VCN logo, one "Sign in with Google" button.
// A Google account that is not in config/users.json never gets a session
// (src/auth.ts refuses it at sign-in), so it lands back here with
// ?error=AccessDenied and sees the "This dashboard is private" notice.

import { redirect } from "next/navigation";
import { currentUser, signIn } from "@/auth";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Only same-site paths are honoured as the post-login destination. */
function safeCallback(v: string | undefined): string {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/login") || v.startsWith("/api/")) return "/";
  return v;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const callbackUrl = safeCallback(first(sp.callbackUrl));
  if (await currentUser()) redirect(callbackUrl);
  const error = first(sp.error);
  const denied = error === "AccessDenied";
  const otherError = Boolean(error) && !denied;

  async function startGoogle() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  return (
    <div className="login">
      <div className="login-card">
        <img className="login-logo" src="/vcn-logo.png" alt="Veteran Careers Network" width={88} height={88} />
        <h1 className="login-title">VCN Sales Dashboard</h1>
        <div className="login-sub">by Intelagent Media</div>
        {denied ? (
          <div className="login-notice" role="alert">
            <strong>This dashboard is private.</strong>
            <span>The Google account you chose is not on the access list, so you have not been signed in. If you should have access, ask Diego to add your address.</span>
          </div>
        ) : null}
        {otherError ? (
          <div className="login-notice" role="alert">
            <strong>Sign-in did not complete.</strong>
            <span>Please try again. If it keeps failing, the Google sign-in settings may need attention.</span>
          </div>
        ) : null}
        <form action={startGoogle}>
          <button type="submit" className="btn btn-google">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.7c-.3 2.1-1.7 5.3-4.8 7.4l7.4 5.7c4.4-4.1 7.2-10.1 7.2-16.8z" />
              <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.7 2.4-8.5 2.4-6.3 0-11.6-4.1-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z" />
            </svg>
            Sign in with Google
          </button>
        </form>
        <div className="login-foot">Access is limited to the Intelagent Media team and VCN sales reps. Read-only view of Go High Level.</div>
      </div>
    </div>
  );
}
