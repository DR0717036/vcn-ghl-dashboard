// The sales reps for per-rep goals and the leaderboard come from
// config/sales-reps.json and are matched to GHL users by email. Everyone
// else in GHL still counts toward team totals.

import raw from "../../config/sales-reps.json";
import { getDb } from "@/lib/db";

export interface Rep {
  name: string;
  email: string;
}

export const salesReps: Rep[] = (raw as { reps: Rep[] }).reps;

export interface RepRoster {
  /** GHL user id → configured rep, for reps found in the users table. */
  byUserId: Map<string, Rep>;
  /** Configured reps whose email matched no GHL user (shown as a warning, never silently dropped). */
  unmatched: Rep[];
  /** Number of reps in config, used as the team multiplier for per-rep goals. */
  count: number;
}

export function repRoster(): RepRoster {
  const users = getDb().prepare(`SELECT id, email FROM users`).all() as { id: string; email: string | null }[];
  const byEmail = new Map(users.filter((u) => u.email).map((u) => [u.email!.trim().toLowerCase(), u.id]));
  const byUserId = new Map<string, Rep>();
  const unmatched: Rep[] = [];
  for (const rep of salesReps) {
    const id = byEmail.get(rep.email.trim().toLowerCase());
    if (id) byUserId.set(id, rep);
    else unmatched.push(rep);
  }
  return { byUserId, unmatched, count: salesReps.length };
}
