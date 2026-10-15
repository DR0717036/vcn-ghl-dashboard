// Email engagement status helpers shared by the sync phase and the cards.
//
// GHL's single-email endpoint reports one status per email on a ladder:
// pending/scheduled/sent → delivered → opened → clicked (read also exists),
// or failed/undelivered with the provider's error text. Opened implies
// delivered; clicked implies opened. Bounce kind is inferred from the
// error text where it can be told apart: hard = the address does not exist
// (5.1.1, no such user, no MX); soft = a temporary condition (4.x.x,
// mailbox full, greylisting, timeouts); otherwise unknown.

export type BounceKind = "hard" | "soft" | "unknown";

export function bounceKind(status: string | null | undefined, error: string | null | undefined): BounceKind | null {
  const s = (status ?? "").toLowerCase();
  if (s !== "failed" && s !== "undelivered") return null;
  const e = (error ?? "").toLowerCase();
  if (!e) return "unknown";
  if (/5\.1\.1|5\.1\.[0-9]|does not exist|no such user|user unknown|unknown user|no mx|invalid recipient|recipient address rejected|mailbox unavailable|address rejected|not exist/.test(e)) return "hard";
  if (/4\.[0-9]\.[0-9]|mailbox full|over quota|temporar|greylist|try again|timed out|timeout|deferred|rate limit|too many/.test(e)) return "soft";
  return "unknown";
}

export const DELIVERED_STATUSES = new Set(["delivered", "opened", "clicked", "read"]);
export const OPENED_STATUSES = new Set(["opened", "clicked", "read"]);
export const BOUNCED_STATUSES = new Set(["failed", "undelivered"]);
