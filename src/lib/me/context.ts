// Which rep a /me page is about. A signed-in rep always sees themself; an
// admin may open any rep's view with ?as=<GHL user id> ("View as rep" on the
// Rep Performance section). Nothing else can widen the view: a rep passing
// ?as= is ignored, so a rep can only ever receive their own data.

import fs from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import type { SignedInUser } from "@/auth";
import { requirePageUser } from "@/lib/guard";
import { salesReps, type Rep } from "@/lib/reps";

export interface RepView {
  rep: Rep;
  userId: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  /** "Full-time" / "Part-time" from the rep's kpiMultiplier, as the Rep Performance cards label it. */
  role: "Full-time" | "Part-time";
  viewer: SignedInUser;
  /** True when an admin is looking at a rep's page. */
  viewingAs: boolean;
}

export function initialsOf(name: string): string {
  const parts = name.replace(/[.]/g, "").split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function photoFor(rel: string | undefined): string | null {
  if (!rel) return null;
  const clean = rel.replace(/^\/+/, "");
  return fs.existsSync(path.join(process.cwd(), "public", clean)) ? `/${clean}` : null;
}

export function repViewOf(rep: Rep, viewer: SignedInUser, viewingAs: boolean): RepView {
  return { rep, userId: rep.userId, name: rep.name, initials: initialsOf(rep.name), photoUrl: photoFor(rep.photo), role: (rep.kpiMultiplier ?? 1) >= 1 ? "Full-time" : "Part-time", viewer, viewingAs };
}

/**
 * The rep a page under /me is about. Reps get their own entry; admins need
 * ?as= (otherwise they are sent back to the Rep Performance section).
 */
export async function requireRepView(callbackPath: string, asParam: string | undefined): Promise<RepView> {
  const viewer = await requirePageUser(callbackPath);
  if (viewer.role === "rep") {
    const rep = salesReps.find((r) => r.userId === viewer.repUserId);
    if (!rep) redirect("/login?error=Configuration");
    return repViewOf(rep, viewer, false);
  }
  const rep = asParam ? salesReps.find((r) => r.userId === asParam) : undefined;
  if (!rep) redirect("/#sec-reps");
  return repViewOf(rep, viewer, true);
}

/** The rep an API route under /api/me may answer for: the signed-in rep, or ?as= for an admin. Null = refuse. */
export function repForApi(viewer: SignedInUser, asParam: string | null): Rep | null {
  if (viewer.role === "rep") return salesReps.find((r) => r.userId === viewer.repUserId) ?? null;
  return asParam ? (salesReps.find((r) => r.userId === asParam) ?? null) : null;
}
