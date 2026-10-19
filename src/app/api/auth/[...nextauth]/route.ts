// Auth.js endpoints (/api/auth/*): Google sign-in, callback, session, sign-out.
// These are the only /api routes reachable without a session.
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
