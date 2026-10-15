"use client";

// Drilldown pop-ups for the Submissions row (owner edits rounds 5 and 6).
//
// One modal component serves both uses: a KPI card (all contacts the card
// counted) and a rep row in Program Submissions (contacts credited to that
// user, plus the won opportunities counted this month for won-based plans).
// Rows come from GET /api/drilldown, fetched only when a drilldown is opened,
// never preloaded into the page. Each table sorts by any column and its
// "Download CSV" exports exactly the rows shown, in the order shown.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OUTCOME_SHORT, type CallOutcome } from "@/lib/callOutcomes";
import type { DrillResult, DrillRow } from "@/lib/drilldown";
import HeatMap from "./charts/HeatMap";
import LineChart, { type LineSeries } from "./charts/LineChart";
import Notes from "./Notes";

export type ColumnKey =
  | "name"
  | "source"
  | "assignedUser"
  | "pipeline"
  | "status"
  | "phone"
  | "email"
  | "value"
  | "stage"
  | "stageReached"
  | "tags"
  | "createdOn"
  | "reachedOn"
  | "wonOn"
  | "direction"
  | "outcome"
  | "duration"
  | "calledOn"
  | "callOutcome"
  | "recording"
  | "channel"
  | "preview"
  | "waiting"
  | "unread"
  | "inboundAt"
  | "repliedAt"
  | "responseTime"
  | "withinTarget"
  | "template"
  | "sentBy"
  | "tagClass"
  | "sentAt";

const COLUMNS: Record<ColumnKey, { label: string; kind: "text" | "number" | "date" }> = {
  name: { label: "Contact name", kind: "text" },
  source: { label: "Source", kind: "text" },
  assignedUser: { label: "Assigned user", kind: "text" },
  pipeline: { label: "Pipeline", kind: "text" },
  status: { label: "Status", kind: "text" },
  phone: { label: "Phone", kind: "text" },
  email: { label: "Email", kind: "text" },
  value: { label: "Opportunity Value", kind: "number" },
  stage: { label: "Stage", kind: "text" },
  stageReached: { label: "Stage reached", kind: "text" },
  tags: { label: "Tags", kind: "text" },
  createdOn: { label: "Created on", kind: "date" },
  reachedOn: { label: "Reached stage on", kind: "date" },
  wonOn: { label: "Won on", kind: "date" },
  direction: { label: "Direction", kind: "text" },
  outcome: { label: "Outcome", kind: "text" },
  duration: { label: "Duration", kind: "number" },
  calledOn: { label: "Time", kind: "date" },
  callOutcome: { label: "Outcome", kind: "text" },
  recording: { label: "Recording", kind: "text" },
  channel: { label: "Channel", kind: "text" },
  preview: { label: "Last inbound message", kind: "text" },
  waiting: { label: "Waiting", kind: "number" },
  unread: { label: "Unread", kind: "number" },
  inboundAt: { label: "Inbound at", kind: "date" },
  repliedAt: { label: "Replied at", kind: "date" },
  responseTime: { label: "Response (business time)", kind: "number" },
  withinTarget: { label: "Within target", kind: "text" },
  template: { label: "Template (best match)", kind: "text" },
  sentBy: { label: "Sent by", kind: "text" },
  tagClass: { label: "Tag", kind: "text" },
  sentAt: { label: "Template sent at", kind: "date" },
};

/** KPI card drilldown columns, in the owner's order. */
export const KPI_COLUMNS: ColumnKey[] = ["name", "source", "assignedUser", "pipeline", "status", "phone", "email", "value", "stage", "tags", "createdOn", "reachedOn"];
/** Rep row drilldown columns, in the owner's order. */
export const REP_COLUMNS: ColumnKey[] = ["name", "email", "phone", "source", "pipeline", "stageReached", "tags", "reachedOn"];
/** Won opportunities listed under a won-based rep. */
export const WON_COLUMNS: ColumnKey[] = ["name", "pipeline", "stage", "value", "wonOn"];
/** Contacts behind an opt-out / interest / reply row. */
export const KEYWORD_COLUMNS: ColumnKey[] = ["name", "tagClass", "channel", "preview", "inboundAt", "template", "sentBy", "sentAt"];

/** Stale conversations for one rep. */
export const STALE_COLUMNS: ColumnKey[] = ["name", "channel", "preview", "unread", "waiting", "inboundAt"];
/** Inbound episodes for one rep (response time drilldown). */
export const RESPONSE_COLUMNS: ColumnKey[] = ["name", "channel", "preview", "unread", "inboundAt", "repliedAt", "responseTime", "withinTarget"];

function fmtWait(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** A rep's calls (Rep Call Activity drilldown). */
export const CALL_COLUMNS: ColumnKey[] = ["name", "direction", "callOutcome", "duration", "calledOn", "recording"];
/** Columns that never go into a CSV (a recording is streamed on click, not a value). */
const NO_CSV: ColumnKey[] = ["recording"];

const OUTCOME_RANK: Record<CallOutcome | "inbound", string> = { conversation: "6", short: "5", voicemail: "4", noanswer: "3", failed: "2", other: "1", inbound: "0" };

function outcomeText(row: DrillRow): string {
  const status = row.outcome ? row.outcome : "no status";
  if (!row.callOutcome) return DASH;
  if (row.callOutcome === "inbound") return `n/a · ${status} (inbound)`;
  return `${OUTCOME_SHORT[row.callOutcome]} · ${status}`;
}

function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(r).padStart(2, "0")}s`;
}

const DASH = "—";
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function fmtDate(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : dateFmt.format(d);
}

function fmtUsd(v: number): string {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Display text and sort key for one cell. Missing data is always a dash, never a placeholder. */
function cell(row: DrillRow, key: ColumnKey): { text: string; sort: string | number | null } {
  switch (key) {
    case "value":
      return { text: row.value === null ? DASH : fmtUsd(row.value), sort: row.value };
    case "tags":
      return { text: row.tags.length ? row.tags.join(", ") : DASH, sort: row.tags.length ? row.tags.join(", ") : null };
    case "createdOn":
      return { text: fmtDate(row.createdOn), sort: row.createdOn };
    case "reachedOn":
    case "wonOn":
    case "calledOn":
      return { text: fmtDate(row.reachedOn), sort: row.reachedOn };
    case "duration":
      return { text: row.durationSec === null || row.durationSec === undefined ? DASH : fmtDuration(row.durationSec), sort: row.durationSec ?? null };
    case "direction":
      return { text: row.direction ? row.direction : DASH, sort: row.direction ?? null };
    case "callOutcome":
      return { text: outcomeText(row), sort: row.callOutcome ? OUTCOME_RANK[row.callOutcome] : null };
    case "channel":
      return { text: row.channel ? row.channel : DASH, sort: row.channel ?? null };
    case "preview":
      return { text: row.preview ? row.preview : DASH, sort: row.preview ? row.preview.toLowerCase() : null };
    case "waiting":
      return { text: row.waitingMinutes === null || row.waitingMinutes === undefined ? DASH : fmtWait(row.waitingMinutes), sort: row.waitingMinutes ?? null };
    case "unread":
      return { text: row.unread === null || row.unread === undefined ? DASH : row.unread.toLocaleString("en-US"), sort: row.unread ?? null };
    case "inboundAt":
      return { text: fmtDate(row.reachedOn), sort: row.reachedOn };
    case "repliedAt":
      return { text: row.repliedAt ? fmtDate(row.repliedAt) : "no reply", sort: row.repliedAt ?? null };
    case "responseTime":
      return { text: row.responseMinutes === null || row.responseMinutes === undefined ? DASH : fmtWait(row.responseMinutes), sort: row.responseMinutes ?? null };
    case "template":
      return { text: row.template ? row.template : DASH, sort: row.template ?? null };
    case "sentBy":
      return { text: row.sentBy ? row.sentBy : DASH, sort: row.sentBy ?? null };
    case "tagClass":
      return { text: row.tagClass ? row.tagClass : DASH, sort: row.tagClass ?? null };
    case "sentAt":
      return { text: row.repliedAt ? fmtDate(row.repliedAt) : DASH, sort: row.repliedAt ?? null };
    case "withinTarget":
      return { text: row.withinTarget === null || row.withinTarget === undefined ? DASH : row.withinTarget ? "Yes" : "No", sort: row.withinTarget === null || row.withinTarget === undefined ? null : row.withinTarget ? "1" : "0" };
    case "recording":
      return { text: row.recordingId ? "available" : DASH, sort: row.recordingId ? 1 : null };
    case "outcome":
      return { text: row.outcome ? row.outcome : DASH, sort: row.outcome ?? null };
    default: {
      const v = row[key];
      return { text: v ? v : DASH, sort: v ? v.toLowerCase() : null };
    }
  }
}

function csvEscape(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(name: string, allColumns: ColumnKey[], rows: DrillRow[]) {
  const columns = allColumns.filter((k) => !NO_CSV.includes(k));
  const lines = [columns.map((k) => csvEscape(COLUMNS[k].label)).join(",")];
  for (const r of rows) lines.push(columns.map((k) => csvEscape(cell(r, k).text)).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9_-]+/gi, "_")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Dir = "asc" | "desc";

/**
 * Inline audio player for one call recording. Nothing is fetched until the
 * person clicks Load; the audio comes from /api/recording on this server
 * (the GHL token never reaches the page) and is held as a blob so the
 * player can scrub and show the duration.
 */
function RecordingCell({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "none" | "error">("idle");
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string>("");
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);
  const load = async () => {
    setState("loading");
    try {
      const r = await fetch(`/api/recording?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (r.status === 404) {
        setState("none");
        return;
      }
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try {
          msg = ((await r.json()) as { error?: string }).error ?? msg;
        } catch {
          // keep the status text
        }
        setErr(msg);
        setState("error");
        return;
      }
      const blob = await r.blob();
      setSrc(URL.createObjectURL(blob));
      setState("ready");
    } catch (e) {
      setErr((e as Error).message);
      setState("error");
    }
  };
  if (state === "ready" && src) return <audio className="rec-player" controls preload="metadata" src={src} />;
  if (state === "none") return <span className="dash">— no recording</span>;
  if (state === "error")
    return (
      <span className="delta-down" title={err}>
        unavailable
      </span>
    );
  return (
    <button type="button" className="rec-btn" onClick={load} disabled={state === "loading"}>
      {state === "loading" ? "Loading…" : "▶ Load recording"}
    </button>
  );
}

/** One sortable table with its own toolbar (row count, reconciliation pill, CSV button). */
function SortableTable({
  rows,
  columns,
  loaded,
  error,
  expected,
  expectedLabel,
  note,
  csvName,
  emptyText,
  defaultSort,
  extraToolbar,
}: {
  extraToolbar?: ReactNode;
  rows: DrillRow[];
  columns: ColumnKey[];
  loaded: boolean;
  error: string | null;
  expected?: number | null;
  expectedLabel: string;
  note?: string | null;
  csvName: string;
  emptyText: string;
  defaultSort: ColumnKey;
}) {
  const [sortKey, setSortKey] = useState<ColumnKey>(defaultSort);
  const [dir, setDir] = useState<Dir>("desc");

  const sorted = useMemo(() => {
    const kind = COLUMNS[sortKey].kind;
    return [...rows].sort((a, b) => {
      const x = cell(a, sortKey).sort;
      const y = cell(b, sortKey).sort;
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const c = kind === "number" ? Number(x) - Number(y) : String(x).localeCompare(String(y));
      return dir === "asc" ? c : -c;
    });
  }, [rows, sortKey, dir]);

  const toggleSort = (key: ColumnKey) => {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir(COLUMNS[key].kind === "text" ? "asc" : "desc");
    }
  };

  const mismatch = loaded && expected !== undefined && expected !== null && rows.length !== expected;

  return (
    <>
      <div className="modal-toolbar">
        <div className="modal-toolbar-text">
          {error ? (
            <span className="delta-down">Could not load rows: {error}</span>
          ) : !loaded ? (
            <span className="kpi-muted">Loading…</span>
          ) : (
            <>
              <b>{rows.length.toLocaleString("en-US")}</b> {rows.length === 1 ? "row" : "rows"}
              {expected !== undefined && expected !== null ? (
                mismatch ? (
                  <span className="pill pill-warn modal-pill">
                    does not match {expectedLabel} ({expected.toLocaleString("en-US")})
                  </span>
                ) : (
                  <span className="pill pill-ok modal-pill">matches {expectedLabel}</span>
                )
              ) : null}
              {note ? <span className="modal-note-inline">{note}</span> : null}
              {extraToolbar}
            </>
          )}
        </div>
        <button type="button" className="btn btn-secondary modal-csv" onClick={() => downloadCsv(csvName, columns, sorted)} disabled={!loaded || rows.length === 0}>
          Download CSV
        </button>
      </div>

      <div className="modal-table-wrap">
        <table className="drill-table">
          <thead>
            <tr>
              {columns.map((k) => (
                <th
                  key={k}
                  className={`${COLUMNS[k].kind === "number" ? "num " : ""}${sortKey === k ? "sorted" : ""}`.trim()}
                  aria-sort={sortKey === k ? (dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button type="button" className="th-sort" onClick={() => toggleSort(k)}>
                    {COLUMNS[k].label}
                    <span className="th-arrow" aria-hidden="true">
                      {sortKey === k ? (dir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loaded && rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="note">
                  {emptyText}
                </td>
              </tr>
            ) : null}
            {sorted.map((r) => (
              <tr key={`${r.milestoneKey}:${r.opportunityId}:${r.contactId ?? ""}`}>
                {columns.map((k) => {
                  const c = cell(r, k);
                  if (k === "recording") {
                    return (
                      <td key={k} className={r.recordingId ? "drill-rec" : "dash"}>
                        {r.recordingId ? <RecordingCell id={r.recordingId} /> : DASH}
                      </td>
                    );
                  }
                  if (k === "name") {
                    return (
                      <td key={k} className="drill-name">
                        {r.ghlUrl ? (
                          <a href={r.ghlUrl} target="_blank" rel="noopener noreferrer" title="Open in GHL">
                            {c.text}
                          </a>
                        ) : (
                          c.text
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={k} className={`${COLUMNS[k].kind === "number" ? "num" : ""}${c.text === DASH ? " dash" : ""}${k === "preview" ? " drill-preview" : ""}`.trim()} title={k === "tags" || k === "preview" ? c.text : undefined}>
                      {c.text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export interface DrilldownSpec {
  /** Query string for /api/drilldown, e.g. "kind=milestone&key=army_ca101&range=this_month". */
  query: string;
  title: string;
  subtitle?: string;
  /** The count / Opportunity Value / status line, rendered as on the card. */
  header?: ReactNode;
  /** The number the card or row shows; the modal confirms its rows match it. */
  expected?: number | null;
  /** Small label/value facts shown under the header (snapshot figures, quota, won, commission). */
  facts?: { label: string; value: string; title?: string }[];
  chart?: { series: LineSeries[]; leftLabel?: string; rightLabel?: string };
  columns: ColumnKey[];
  /** Rep drilldowns: also list the won opportunities counted this month, checked against this number. */
  wonTable?: { title: string; expected: number | null };
  /** Call drilldowns: show the per-day summary (dials, talk time, first outbound call). */
  perDayTable?: { title: string };
  /** Call drilldowns: show the best-times heat map below the call list. */
  heatmap?: boolean;
  /** Call drilldowns: show the outcome filter (All / Conversations / Short pickups / Voicemail / No answer / Failed). */
  outcomeFilter?: boolean;
  /** The Conversations figure on the table row; the modal confirms its Conversation rows match it. */
  expectedConversations?: number | null;
  notes?: string[];
  csvName: string;
}

export function DrilldownModal({ spec, onClose }: { spec: DrilldownSpec; onClose: () => void }) {
  const [data, setData] = useState<DrillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | CallOutcome>("all");
  const allRows = data?.rows ?? [];
  const conversationCount = allRows.filter((r) => r.callOutcome === "conversation").length;
  const shownRows = spec.outcomeFilter && outcomeFilter !== "all" ? allRows.filter((r) => r.callOutcome === outcomeFilter) : allRows;
  const conversationMismatch = data && spec.expectedConversations !== undefined && spec.expectedConversations !== null && conversationCount !== spec.expectedConversations;

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/drilldown?${spec.query}`, { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json()) as DrillResult | { ok: false; error: string };
        if (cancelled) return;
        if (!r.ok || !body.ok) setError("error" in body ? body.error : `Request failed (${r.status}).`);
        else setData(body);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [spec.query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={spec.title}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="modal-head">
          <div className="modal-title">{spec.title}</div>
          {spec.subtitle ? <div className="note modal-sub">{spec.subtitle}</div> : null}
        </div>
        {spec.header ? <div className="modal-header-line">{spec.header}</div> : null}
        {spec.facts && spec.facts.length > 0 ? (
          <div className="modal-facts">
            {spec.facts.map((f) => (
              <span key={f.label} title={f.title}>
                <span className="modal-fact-label">{f.label}</span> <b>{f.value}</b>
              </span>
            ))}
          </div>
        ) : null}
        {spec.chart ? (
          <div className="modal-chart">
            <LineChart height={360} series={spec.chart.series} leftLabel={spec.chart.leftLabel} rightLabel={spec.chart.rightLabel} />
          </div>
        ) : null}

        {spec.outcomeFilter ? (
          <div className="answer-filter" role="group" aria-label="Outcome filter">
            {(
              [
                ["all", "All"],
                ["conversation", "Conversations"],
                ["short", "Short pickups"],
                ["voicemail", "Voicemail"],
                ["noanswer", "No answer"],
                ["failed", "Failed"],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" className={`seg-btn${outcomeFilter === key ? " active" : ""}`} onClick={() => setOutcomeFilter(key)}>
                {label}
                {key !== "all" ? <span className="seg-count">{allRows.filter((r) => r.callOutcome === key).length.toLocaleString("en-US")}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        <SortableTable
          rows={shownRows}
          columns={spec.columns}
          loaded={Boolean(data)}
          error={error}
          expected={spec.outcomeFilter && outcomeFilter !== "all" ? undefined : spec.expected}
          expectedLabel="the card"
          note={data?.detailsNote}
          csvName={spec.csvName}
          emptyText="No contacts in this period."
          defaultSort="reachedOn"
          extraToolbar={
            spec.expectedConversations !== undefined && spec.expectedConversations !== null ? (
              <>
                <span className="modal-sep">·</span>
                <b>{conversationCount.toLocaleString("en-US")}</b> conversations
                {conversationMismatch ? (
                  <span className="pill pill-warn modal-pill">does not match the table ({spec.expectedConversations.toLocaleString("en-US")})</span>
                ) : (
                  <span className="pill pill-ok modal-pill">matches the table</span>
                )}
              </>
            ) : null
          }
        />

        {spec.wonTable ? (
          <>
            <div className="modal-table-title">{spec.wonTable.title}</div>
            <SortableTable
              rows={data?.won ?? []}
              columns={WON_COLUMNS}
              loaded={Boolean(data)}
              error={error}
              expected={spec.wonTable.expected}
              expectedLabel="Won (MTD)"
              csvName={`${spec.csvName} won`}
              emptyText="No won opportunities this month."
              defaultSort="wonOn"
            />
          </>
        ) : null}

        {spec.heatmap && data?.heat ? (
          <div className="modal-heat">
            <HeatMap bundle={data.heat} />
          </div>
        ) : null}

        {spec.perDayTable && data?.perDay ? (
          <>
            <div className="modal-table-title">{spec.perDayTable.title}</div>
            <div className="modal-table-wrap modal-table-compact">
              <table className="drill-table">
                <thead>
                  <tr>
                    <th>
                      <span className="th-sort th-static">Day</span>
                    </th>
                    <th className="num">
                      <span className="th-sort th-static">Dials</span>
                    </th>
                    <th className="num">
                      <span className="th-sort th-static">Talk time</span>
                    </th>
                    <th className="num">
                      <span className="th-sort th-static">First outbound call</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.perDay.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="note">
                        No calls in this period.
                      </td>
                    </tr>
                  ) : null}
                  {data.perDay.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td className="num">{d.dials.toLocaleString("en-US")}</td>
                      <td className={`num${d.talk === DASH ? " dash" : ""}`}>{d.talk}</td>
                      <td className={`num${d.firstCall === DASH ? " dash" : ""}`}>{d.firstCall}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {spec.notes && spec.notes.length > 0 ? (
          <Notes notes={spec.notes} className="modal-notes" />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Wraps a KPI card: clicking anywhere on it (or its Details button) opens the drilldown. */
export function MilestoneDrilldown({ spec, children }: { spec: DrilldownSpec; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "contents" }} onClick={() => setOpen(true)}>
      {children}
      {open ? <DrilldownModal spec={spec} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

/** A clickable rep row in the Program Submissions table. */
export function RepDrilldownRow({ spec, children }: { spec: DrilldownSpec; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <tr
      className="rep-row-click"
      tabIndex={0}
      title="Click to see the contacts behind this row"
      onClick={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      {children}
      {open ? <DrilldownModal spec={spec} onClose={() => setOpen(false)} /> : null}
    </tr>
  );
}
