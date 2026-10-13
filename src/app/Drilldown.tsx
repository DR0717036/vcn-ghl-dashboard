"use client";

// Drilldown pop-ups for the Submissions row (owner edits round 5).
//
// One modal component serves both uses: a KPI card (all contacts the card
// counted) and a rep row in Program Submissions (contacts credited to that
// user). Rows come from GET /api/drilldown, fetched only when a drilldown is
// opened, never preloaded into the page. The table sorts by any column and
// "Download CSV" exports exactly the rows shown, in the order shown.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DrillResult, DrillRow } from "@/lib/drilldown";
import LineChart, { type LineSeries } from "./charts/LineChart";

export type ColumnKey = "name" | "source" | "assignedUser" | "pipeline" | "status" | "phone" | "email" | "value" | "stage" | "stageReached" | "tags" | "createdOn" | "reachedOn";

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
};

/** KPI card drilldown columns, in the owner's order. */
export const KPI_COLUMNS: ColumnKey[] = ["name", "source", "assignedUser", "pipeline", "status", "phone", "email", "value", "stage", "tags", "createdOn", "reachedOn"];
/** Rep row drilldown columns, in the owner's order. */
export const REP_COLUMNS: ColumnKey[] = ["name", "email", "phone", "source", "pipeline", "stageReached", "tags", "reachedOn"];

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

export interface DrilldownSpec {
  /** Query string for /api/drilldown, e.g. "kind=milestone&key=army_ca101&range=this_month". */
  query: string;
  title: string;
  subtitle?: string;
  /** The count / Opportunity Value / status line, rendered as on the card. */
  header?: ReactNode;
  /** The number the card or row shows; the modal confirms its rows match it. */
  expected?: number | null;
  /** Small label/value facts shown under the header (snapshot figures from the card). */
  facts?: { label: string; value: string }[];
  chart?: { series: LineSeries[]; leftLabel?: string; rightLabel?: string };
  columns: ColumnKey[];
  notes?: string[];
  csvName: string;
}

type Dir = "asc" | "desc";

export function DrilldownModal({ spec, onClose }: { spec: DrilldownSpec; onClose: () => void }) {
  const [data, setData] = useState<DrillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ColumnKey>("reachedOn");
  const [dir, setDir] = useState<Dir>("desc");

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

  const rows = useMemo(() => {
    if (!data) return [];
    const kind = COLUMNS[sortKey].kind;
    const sorted = [...data.rows].sort((a, b) => {
      const x = cell(a, sortKey).sort;
      const y = cell(b, sortKey).sort;
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const c = kind === "number" ? Number(x) - Number(y) : String(x).localeCompare(String(y));
      return dir === "asc" ? c : -c;
    });
    return sorted;
  }, [data, sortKey, dir]);

  const toggleSort = (key: ColumnKey) => {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir(COLUMNS[key].kind === "text" ? "asc" : "desc");
    }
  };

  const downloadCsv = () => {
    const lines = [spec.columns.map((k) => csvEscape(COLUMNS[k].label)).join(",")];
    for (const r of rows) lines.push(spec.columns.map((k) => csvEscape(cell(r, k).text)).join(","));
    const blob = new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.csvName.replace(/[^a-z0-9_-]+/gi, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const mismatch = data && spec.expected !== undefined && spec.expected !== null && data.count !== spec.expected;

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
              <span key={f.label}>
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

        <div className="modal-toolbar">
          <div className="modal-toolbar-text">
            {error ? (
              <span className="delta-down">Could not load rows: {error}</span>
            ) : !data ? (
              <span className="kpi-muted">Loading contacts…</span>
            ) : (
              <>
                <b>{data.count.toLocaleString("en-US")}</b> {data.count === 1 ? "row" : "rows"}
                {spec.expected !== undefined && spec.expected !== null ? (
                  mismatch ? (
                    <span className="pill pill-warn modal-pill">does not match the card ({spec.expected.toLocaleString("en-US")})</span>
                  ) : (
                    <span className="pill pill-ok modal-pill">matches the card</span>
                  )
                ) : null}
                {data.detailsNote ? <span className="modal-note-inline">{data.detailsNote}</span> : null}
              </>
            )}
          </div>
          <button type="button" className="btn btn-secondary modal-csv" onClick={downloadCsv} disabled={!data || rows.length === 0}>
            Download CSV
          </button>
        </div>

        <div className="modal-table-wrap">
          <table className="drill-table">
            <thead>
              <tr>
                {spec.columns.map((k) => (
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
              {data && rows.length === 0 ? (
                <tr>
                  <td colSpan={spec.columns.length} className="note">
                    No contacts in this period.
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => (
                <tr key={`${r.milestoneKey}:${r.opportunityId}:${r.contactId ?? ""}`}>
                  {spec.columns.map((k) => {
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
