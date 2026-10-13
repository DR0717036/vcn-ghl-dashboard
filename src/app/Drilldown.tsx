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
import type { DrillResult, DrillRow } from "@/lib/drilldown";
import LineChart, { type LineSeries } from "./charts/LineChart";

export type ColumnKey = "name" | "source" | "assignedUser" | "pipeline" | "status" | "phone" | "email" | "value" | "stage" | "stageReached" | "tags" | "createdOn" | "reachedOn" | "wonOn";

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
};

/** KPI card drilldown columns, in the owner's order. */
export const KPI_COLUMNS: ColumnKey[] = ["name", "source", "assignedUser", "pipeline", "status", "phone", "email", "value", "stage", "tags", "createdOn", "reachedOn"];
/** Rep row drilldown columns, in the owner's order. */
export const REP_COLUMNS: ColumnKey[] = ["name", "email", "phone", "source", "pipeline", "stageReached", "tags", "reachedOn"];
/** Won opportunities listed under a won-based rep. */
export const WON_COLUMNS: ColumnKey[] = ["name", "pipeline", "stage", "value", "wonOn"];

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
      return { text: fmtDate(row.reachedOn), sort: row.reachedOn };
    default: {
      const v = row[key];
      return { text: v ? v : DASH, sort: v ? v.toLowerCase() : null };
    }
  }
}

function csvEscape(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(name: string, columns: ColumnKey[], rows: DrillRow[]) {
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
}: {
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
                    <td key={k} className={`${COLUMNS[k].kind === "number" ? "num" : ""}${c.text === DASH ? " dash" : ""}`.trim()} title={k === "tags" ? c.text : undefined}>
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
  notes?: string[];
  csvName: string;
}

export function DrilldownModal({ spec, onClose }: { spec: DrilldownSpec; onClose: () => void }) {
  const [data, setData] = useState<DrillResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

        <SortableTable
          rows={data?.rows ?? []}
          columns={spec.columns}
          loaded={Boolean(data)}
          error={error}
          expected={spec.expected}
          expectedLabel="the card"
          note={data?.detailsNote}
          csvName={spec.csvName}
          emptyText="No contacts in this period."
          defaultSort="reachedOn"
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

        {spec.notes && spec.notes.length > 0 ? (
          <div className="modal-notes">
            <div className="label kpi-notes-title">How this is counted</div>
            <ul className="plain note">
              {spec.notes.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
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
