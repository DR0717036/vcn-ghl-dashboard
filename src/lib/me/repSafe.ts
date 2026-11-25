// Opportunity Value never reaches a rep (owner request 2026-11-24). The rep
// libraries (src/lib/me/*) no longer compute it, and this module is the
// server-side backstop for the rep API routes: every JSON response under
// /api/me passes through repSafe(), which removes any key that could carry
// an opportunity's value (or a call recording id) wherever it sits in the
// object, so a future field cannot leak through a component. The test in
// tests/rep-views.test.mjs fails if any /me or /invoices response still
// carries one of these keys or the words "Opportunity Value".

import type { DrillResult, DrillRow } from "@/lib/drilldown";

/** Keys that carry Opportunity Value somewhere in the dashboard's data. "value" is included because every rep API row that had it meant Opportunity Value. */
export const OPPORTUNITY_VALUE_KEYS = ["value", "value_at_event", "monetary_value", "monetaryValue", "opportunityValue", "oppValue", "wonValue", "openValue", "currentValue", "prevValue", "valueMissing", "zeroValue"] as const;

/** Keys a rep must not receive for other reasons (call recordings stay admin-only). */
export const REP_HIDDEN_KEYS = ["recordingId"] as const;

const HIDDEN = new Set<string>([...OPPORTUNITY_VALUE_KEYS, ...REP_HIDDEN_KEYS]);

/** A drilldown row as a rep receives it: no Opportunity Value, no recording id. */
export type RepDrillRow = Omit<DrillRow, "value" | "recordingId">;

/** A drilldown result as a rep receives it. */
export type RepDrillResult = Omit<DrillResult, "rows" | "won"> & { rows: RepDrillRow[]; won?: RepDrillRow[] };

/**
 * Deep-copies a JSON-serialisable value without the hidden keys. Returns the
 * copy and the paths of the keys it dropped, so a caller can log a leak it
 * was not expecting. Primitives and Dates pass through unchanged.
 */
export function stripHidden<T>(input: T): { out: T; dropped: string[] } {
  const dropped: string[] = [];
  const walk = (v: unknown, path: string): unknown => {
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`));
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (HIDDEN.has(k)) {
          dropped.push(`${path}.${k}`);
          continue;
        }
        o[k] = walk(x, `${path}.${k}`);
      }
      return o;
    }
    return v;
  };
  return { out: walk(input, "$") as T, dropped };
}

/** What a rep API route may send: the input without any Opportunity Value or recording key. Logs when it had to drop one (a sign some library still produces it). */
export function repSafe<T>(input: T, route: string): T {
  const { out, dropped } = stripHidden(input);
  if (dropped.length > 0) {
    const paths = [...new Set(dropped.map((p) => p.replace(/\[\d+\]/g, "[]")))];
    console.warn(`[repSafe] ${route}: removed ${dropped.length} hidden field(s) before answering: ${paths.slice(0, 8).join(", ")}`);
  }
  return out;
}

/** Drops the value and recording keys from a drilldown row at the source (typed), for the rep libraries. */
export function repRow(r: DrillRow): RepDrillRow {
  const { value: _value, recordingId: _rec, ...rest } = r;
  void _value;
  void _rec;
  return rest;
}
