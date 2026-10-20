// Plain-English explanations of sync failures, for the scorecard's sync line
// and the Mapping page. The sync itself stores the raw error text in
// sync_runs.summary; this turns it into something the owner can act on.

const PHASE_NAMES: Record<string, string> = {
  users: "Team members",
  contacts: "Contacts",
  opportunities: "Opportunities",
  calls: "Calls",
  appointments: "Appointments",
  messages: "Messages",
  conversations: "Conversations",
  workflows: "Workflows",
  emailTemplates: "Email templates",
  emailStatus: "Email delivery status",
};

/** The five phases the scorecard's core numbers depend on. */
export const CORE_PHASES = ["users", "contacts", "opportunities", "calls", "appointments"] as const;

export function phaseName(key: string): string {
  return PHASE_NAMES[key] ?? key;
}

/** One raw error message → one actionable sentence. */
export function explainError(raw: string): string {
  const s = raw.toLowerCase();
  if (/disk is full|sqlite_full|enospc|no space left/.test(s)) {
    return "the cache disk was full while saving. Free space or enlarge the volume; the next cycle resumes where this one stopped.";
  }
  if (/interrupted|server restarted|server stopped/.test(s)) return "the server restarted during the sync; the next cycle resumes it.";
  if (/database is locked|sqlite_busy/.test(s)) return "the cache was busy with another write; the next cycle retries.";
  if (/permission|unauthori[sz]ed|forbidden|\b401\b|\b403\b/.test(s)) {
    return "GHL refused the request (token permission). Check the private integration token's read scopes.";
  }
  if (/rate limit|too many requests|\b429\b/.test(s)) return "GHL's rate limit was reached; the next cycle retries.";
  if (/bad_request|\b400\b|\b422\b/.test(s)) return "GHL rejected one request (a transient error on its side); the next cycle retries.";
  if (/enotfound|eai_again|getaddrinfo/.test(s)) {
    return "this computer could not look up GHL's address, so it had no working internet connection at that moment (common right after waking from sleep); the next cycle retries.";
  }
  if (/certificate|cert_|\btls\b|\bssl\b/.test(s)) return "the secure connection to GHL could not be verified (TLS certificate problem on the network path); the next cycle retries.";
  if (/timed out|etimedout|timeout|aborted/.test(s)) return "GHL did not answer within the time limit (slow network or GHL outage); the next cycle retries.";
  if (/econnrefused|econnreset|epipe|socket hang up/.test(s)) return "the connection to GHL was refused or dropped (network problem or GHL outage); the next cycle retries.";
  if (/\b5\d\d\b/.test(s)) return "GHL answered with a server error on its side after retries; the next cycle retries.";
  if (/fetch failed|econn|network|socket/.test(s)) {
    return "GHL could not be reached (network problem on this machine or a GHL outage); the next cycle retries.";
  }
  return `the sync reported "${raw}".`;
}

/**
 * Explain a sync_runs.summary string. Summaries look like
 * "7 of 10 phases succeeded. messages: database or disk is full; emailTemplates: …"
 * or free text such as "Interrupted: …". Returns one sentence per failed phase.
 */
export function explainSyncSummary(summary: string | null | undefined): string {
  if (!summary) return "No details were recorded.";
  const m = summary.match(/^\d+ of \d+ phases succeeded\.\s*(.*)$/s);
  if (!m) return capitalize(explainError(summary));
  const parts = m[1]
    .split(/;\s+(?=[A-Za-z]+: )/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "Some phases did not finish; no details were recorded.";
  return parts
    .map((p) => {
      const i = p.indexOf(": ");
      const phase = i > 0 ? p.slice(0, i) : "";
      const err = i > 0 ? p.slice(i + 2) : p;
      return `${phase ? phaseName(phase) + ": " : ""}${explainError(err)}`;
    })
    .join(" ");
}

/** Which phases a summary says failed (empty when none or unknown). */
export function failedPhases(summary: string | null | undefined): string[] {
  const m = summary?.match(/^\d+ of \d+ phases succeeded\.\s*(.*)$/s);
  if (!m) return [];
  return m[1]
    .split(/;\s+(?=[A-Za-z]+: )/)
    .map((p) => p.trim().split(": ")[0])
    .filter((p) => p && PHASE_NAMES[p]);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const LOW_DISK_BYTES = 1_000_000_000; // warn below 1 GB free

export function fmtBytes(b: number | null | undefined): string {
  if (b === null || b === undefined) return "unavailable";
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.round(b / 1e3)} KB`;
}

/** A warning sentence when the cache disk is low, else null. */
export function lowDiskMessage(freeBytes: number | null, dir: string): string | null {
  if (freeBytes === null) return null;
  if (freeBytes >= LOW_DISK_BYTES) return null;
  return `Only ${fmtBytes(freeBytes)} free on the cache disk (${dir}). The sync will fail with "disk full" when it runs out; enlarge the volume.`;
}
