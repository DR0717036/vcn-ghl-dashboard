// Outbound call outcomes (owner decision 2026-10-15). Pure helpers shared by
// the server (Rep Call Activity) and the drilldown modal, so a call lands in
// the same bucket everywhere.
//
// GHL marks both human pickups and undetected answering machines as
// "completed", so "Conversation" is ESTIMATED by duration: a completed call
// at or above the configured threshold (config/goals.json →
// callOutcomes.conversationMinSeconds, default 60). Talk time is not
// affected by this split.

export type CallOutcome = "conversation" | "short" | "voicemail" | "noanswer" | "failed" | "other";

export const OUTCOMES: CallOutcome[] = ["conversation", "short", "voicemail", "noanswer", "failed", "other"];

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  conversation: "Conversation",
  short: "Short pickup / likely machine",
  voicemail: "Voicemail",
  noanswer: "No answer",
  failed: "Failed",
  other: "Other / unknown status",
};

export const OUTCOME_SHORT: Record<CallOutcome, string> = {
  conversation: "Conversation",
  short: "Short pickup",
  voicemail: "Voicemail",
  noanswer: "No answer",
  failed: "Failed",
  other: "Other",
};

export const DEFAULT_CONVERSATION_MIN_SECONDS = 60;

/** Which status wins when a call's legs disagree: a connected leg beats everything else. */
const STATUS_PRIORITY = ["completed", "answered", "voicemail", "no-answer", "ringing", "failed", "busy", "canceled"];

/** Pick the representative GHL status from a comma-joined list of a call's leg statuses. */
export function pickStatus(joined: string | null): string | null {
  if (!joined) return null;
  const statuses = joined.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const p of STATUS_PRIORITY) if (statuses.includes(p)) return p;
  return statuses[0] ?? null;
}

export function classifyOutcome(status: string | null, durationSec: number | null, thresholdSec: number): CallOutcome {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" || s === "answered") return (durationSec ?? 0) >= thresholdSec ? "conversation" : "short";
  if (s === "voicemail") return "voicemail";
  if (s === "no-answer" || s === "ringing") return "noanswer";
  if (s === "failed" || s === "busy" || s === "canceled") return "failed";
  return "other";
}

export function emptyOutcomes(): Record<CallOutcome, number> {
  return { conversation: 0, short: 0, voicemail: 0, noanswer: 0, failed: 0, other: 0 };
}
