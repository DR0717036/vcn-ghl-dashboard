// Allow-list of Google accounts (config/users.json). Read from disk with a
// modification-time check so the owner can edit the file without restarting
// the server. Server-only: never import from a client component.

import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "config", "users.json");

let cache: { mtimeMs: number; emails: Set<string> } | null = null;

export function allowedEmails(): Set<string> {
  const mtimeMs = fs.statSync(FILE).mtimeMs;
  if (cache && cache.mtimeMs === mtimeMs) return cache.emails;
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as { allowedEmails?: unknown };
  const list = Array.isArray(raw.allowedEmails) ? raw.allowedEmails : [];
  const emails = new Set(list.filter((e): e is string => typeof e === "string").map((e) => e.trim().toLowerCase()).filter(Boolean));
  cache = { mtimeMs, emails };
  return emails;
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().has(email.trim().toLowerCase());
}
