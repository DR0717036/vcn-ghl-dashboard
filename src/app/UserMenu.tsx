// Header block for the signed-in user: name and a Sign out link (a form so
// the sign-out is a POST through Auth.js, not a bare GET link).

import { signOut } from "@/auth";
import type { SignedInUser } from "@/auth";

export default function UserMenu({ user }: { user: SignedInUser }) {
  async function endSession() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  return (
    <form action={endSession} className="user-menu">
      {user.image ? <img className="user-avatar" src={user.image} alt="" width={28} height={28} referrerPolicy="no-referrer" /> : null}
      <span className="user-name" title={user.email}>
        {user.name}
      </span>
      <button type="submit" className="user-signout">
        Sign out
      </button>
    </form>
  );
}
