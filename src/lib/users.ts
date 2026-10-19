// Allow-list of Google accounts (config/users.json). Read from disk with a
// modification-time check so the owner can edit the file without restarting
// the server. Server-only: never import from a client component.

import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "config", "users.json");

let cache: { mtimeMs: number; emails: Set<string>; admins: Set<string> } | null = null;

function load(): { emails: Set<string>; admins: Set<string> } {
  const mtimeMs = fs.statSync(FILE).mtimeMs;
  if (cache && cache.mtimeMs === mtimeMs) return cache;
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as { allowedEmails?: unknown; historyImportAdmins?: unknown };
  const norm = (v: unknown) => new Set((Array.isArray(v) ? v : []).filter((e): e is string => typeof e === "string").map((e) => e.trim().toLowerCase()).filter(Boolean));
  cache = { mtimeMs, emails: norm(raw.allowedEmails), admins: norm(raw.historyImportAdmins) };
  return cache;
}

export function allowedEmails(): Set<string> {
  return load().emails;
}

/** May merge event history from another copy of the dashboard (must also be an allowed email). */
export function isHistoryImportAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return load().emails.has(e) && load().admins.has(e);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().has(email.trim().toLowerCase());
}
