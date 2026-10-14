// READ-ONLY HTTP layer for Go High Level.
//
// This module deliberately exposes GET only. Nothing in this application may
// send POST, PUT, PATCH, or DELETE to GHL (see CLAUDE.md "HARD RULE").
// If a read endpoint ever genuinely requires POST (a documented search
// endpoint), it must be added here explicitly, reviewed, and named so the
// read-only intent is obvious.
//
// Verified against HighLevel's official OpenAPI specs (github.com/GoHighLevel/
// highlevel-api-docs). Base URL and Version header values come from there.

import { getEnv } from "@/lib/env";

const BASE_URL = "https://services.leadconnectorhq.com";

/** The Version header value each API family requires, per the official spec. */
export type ApiVersion = "2021-07-28" | "2021-04-15";

export type ErrorKind =
  | "permission" // 401 / 403: token lacks the scope, or is invalid
  | "not_found" // 404
  | "bad_request" // 400 / 422: we sent something the API rejected
  | "rate_limited" // 429 after retries
  | "server" // 5xx after retries
  | "network" // could not reach GHL
  | "other";

export interface GhlOk<T> {
  ok: true;
  status: number;
  data: T;
}
export interface GhlErr {
  ok: false;
  status: number | null;
  kind: ErrorKind;
  error: string;
}
export type GhlResult<T> = GhlOk<T> | GhlErr;

type Query = Record<string, string | number | boolean | undefined>;

// --- gentle client-side pacing so a burst of probes never trips GHL's
// burst limit (100 requests / 10 s per app). ------------------------------
const MIN_GAP_MS = 120;
let lastSlotAt = 0;
let queue: Promise<void> = Promise.resolve();

function takeSlot(): Promise<void> {
  const next = queue.then(async () => {
    const wait = lastSlotAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastSlotAt = Date.now();
  });
  queue = next.catch(() => undefined);
  return next;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt);
}

function classify(status: number): ErrorKind {
  if (status === 401 || status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "bad_request";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "other";
}

/** Trim an error body to something short and human-readable. */
function summarizeBody(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "(empty response body)";
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const msg = parsed.message ?? parsed.error ?? parsed.msg;
    if (Array.isArray(msg)) return msg.join("; ").slice(0, 300);
    if (typeof msg === "string") return msg.slice(0, 300);
  } catch {
    // not JSON; fall through
  }
  return trimmed.slice(0, 300);
}

/**
 * Perform one GET against GHL with pacing, retries on 429/5xx/network
 * errors, and a structured result. Never throws for HTTP errors.
 */
export async function ghlGet<T>(
  path: string,
  version: ApiVersion,
  query: Query = {},
): Promise<GhlResult<T>> {
  const { token } = getEnv();
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await takeSlot();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Version: version,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch (err) {
      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return {
        ok: false,
        status: null,
        kind: "network",
        error: `Could not reach GHL: ${(err as Error).message}`,
      };
    }

    if (res.ok) {
      try {
        return { ok: true, status: res.status, data: (await res.json()) as T };
      } catch {
        return { ok: false, status: res.status, kind: "other", error: "GHL returned a non-JSON body" };
      }
    }

    const body = summarizeBody(await res.text());
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < maxAttempts) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
      continue;
    }
    return { ok: false, status: res.status, kind: classify(res.status), error: `HTTP ${res.status}: ${body}` };
  }
  return { ok: false, status: null, kind: "other", error: "Gave up after retries" };
}


export interface GhlStreamOk {
  ok: true;
  status: number;
  body: ReadableStream<Uint8Array> | null;
  contentType: string | null;
}

/**
 * One paced GET that returns the raw response body as a stream instead of
 * parsing JSON. Used for call recordings (audio). Never throws for HTTP errors.
 */
export async function ghlGetStream(path: string, version: ApiVersion): Promise<GhlStreamOk | GhlErr> {
  const { token } = getEnv();
  const url = new URL(path, BASE_URL);
  await takeSlot();
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Version: version, Accept: "*/*" }, cache: "no-store" });
  } catch (err) {
    return { ok: false, status: null, kind: "network", error: `Could not reach GHL: ${(err as Error).message}` };
  }
  if (res.ok) return { ok: true, status: res.status, body: res.body, contentType: res.headers.get("content-type") };
  const body = summarizeBody(await res.text());
  return { ok: false, status: res.status, kind: classify(res.status), error: `HTTP ${res.status}: ${body}` };
}
