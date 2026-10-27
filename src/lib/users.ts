// Who may sign in and with which role (config/users.json for admins,
// config/sales-reps.json for the reps' sign-in addresses). Both files are
// read from disk with a modification-time check, so the owner can add an
// admin or a rep's sign-in address without restarting the server (the rest
// of the rep roster is a build-time import like everywhere else). Server-
// only: never import from a client component. Safe for src/proxy.ts: no
// database access here.

import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "config", "users.json");
const REPS_FILE = path.join(process.cwd(), "config", "sales-reps.json");

export type Role = "admin" | "rep";

interface RepEntry {
  name: string;
  userId: string;
  signInEmail?: string;
}

let cache: { mtimeMs: number; admins: Set<string>; historyAdmins: Set<string> } | null = null;

const norm = (e: string) => e.trim().toLowerCase();

function load(): { admins: Set<string>; historyAdmins: Set<string> } {
  const mtimeMs = fs.statSync(FILE).mtimeMs;
  if (cache && cache.mtimeMs === mtimeMs) return cache;
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as { admins?: unknown; allowedEmails?: unknown; historyImportAdmins?: unknown };
  const set = (v: unknown) => new Set((Array.isArray(v) ? v : []).filter((e): e is string => typeof e === "string").map(norm).filter(Boolean));
  // "allowedEmails" is the pre-roles name of the admin list; still honoured.
  cache = { mtimeMs, admins: set(raw.admins ?? raw.allowedEmails), historyAdmins: set(raw.historyImportAdmins) };
  return cache;
}

let repCache: { mtimeMs: number; accounts: Map<string, { userId: string; name: string }> } | null = null;

/** Sign-in address → rep (GHL user id and name), for every rep with a signInEmail. */
function repAccounts(): Map<string, { userId: string; name: string }> {
  const mtimeMs = fs.statSync(REPS_FILE).mtimeMs;
  if (repCache && repCache.mtimeMs === mtimeMs) return repCache.accounts;
  const raw = JSON.parse(fs.readFileSync(REPS_FILE, "utf8")) as { reps?: RepEntry[] };
  const accounts = new Map<string, { userId: string; name: string }>();
  for (const r of Array.isArray(raw.reps) ? raw.reps : []) {
    const e = typeof r.signInEmail === "string" ? norm(r.signInEmail) : "";
    if (e && typeof r.userId === "string") accounts.set(e, { userId: r.userId, name: r.name });
  }
  repCache = { mtimeMs, accounts };
  return accounts;
}

export function adminEmails(): Set<string> {
  return load().admins;
}

/** Every address that may sign in: admins plus reps with a sign-in address. */
export function allowedEmails(): Set<string> {
  return new Set([...load().admins, ...repAccounts().keys()]);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && load().admins.has(norm(email as string));
}

/** The rep account for a sign-in address, or null (admins are not reps even if they also appear in the roster). */
export function repForEmail(email: string | null | undefined): { userId: string; name: string } | null {
  if (!email) return null;
  const e = norm(email);
  if (load().admins.has(e)) return null;
  return repAccounts().get(e) ?? null;
}

/** admin, rep, or null when the address may not sign in. An address on both lists is an admin. */
export function roleFor(email: string | null | undefined): Role | null {
  if (!email) return null;
  const e = norm(email);
  if (load().admins.has(e)) return "admin";
  if (repAccounts().has(e)) return "rep";
  return null;
}

/** May merge event history from another copy of the dashboard and use the weekly-report admin route (must be an admin). */
export function isHistoryImportAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = norm(email);
  return load().admins.has(e) && load().historyAdmins.has(e);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  return roleFor(email) !== null;
}
