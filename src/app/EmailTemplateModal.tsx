"use client";

// Drilldown modal for one email template cluster: header, engagement stats
// row (what the API supports; the rest "unavailable in API"), a sandboxed
// preview of the template HTML with the subject, a small daily sends chart,
// and How this is counted. Data comes from /api/email-template on open.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { EmailTemplateDrill } from "@/lib/emailTemplate";
import { chartSeries } from "@/lib/design";
import LineChart from "./charts/LineChart";
import Notes from "./Notes";

const n = (v: number) => v.toLocaleString("en-US");
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

export interface EmailTemplateSpec {
  templateKey: string;
  rangeQuery: string;
  label: string;
}

export function EmailTemplateModal({ spec, onClose }: { spec: EmailTemplateSpec; onClose: () => void }) {
  const [data, setData] = useState<EmailTemplateDrill | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/email-template?template=${encodeURIComponent(spec.templateKey)}&${spec.rangeQuery}`, { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json()) as EmailTemplateDrill | { ok: false; error: string };
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
  }, [spec.templateKey, spec.rangeQuery]);

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
      <div className="modal" role="dialog" aria-modal="true" aria-label={spec.label}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="modal-head">
          <div className="modal-title">{data?.title ?? spec.label}</div>
          <div className="note modal-sub">
            {data ? (
              <>
                Workflow: <b>{data.workflow ?? "not mapped yet"}</b>
                {data.preview.templateName ? (
                  <>
                    {" "}· Email builder template: <b>{data.preview.templateName}</b>
                  </>
                ) : null}{" "}
                · <b>{n(data.sends)}</b> sends in {data.rangeLabel} · best-match attribution
              </>
            ) : error ? (
              <span className="delta-down">Could not load: {error}</span>
            ) : (
              "Loading…"
            )}
          </div>
        </div>

        {data ? (
          <>
            <div className="email-stats" data-check={JSON.stringify({ sends: data.sends, replied: data.stats.find((s) => s.key === "replied")?.count ?? null })}>
              {data.stats.map((s) => (
                <div key={s.key} className={`email-stat${s.count === null ? " is-unavailable" : ""}`} title={s.reason}>
                  <div className="email-stat-label">{s.label}</div>
                  <div className="email-stat-pct">{s.count === null ? "unavailable in API" : pct(s.pct)}</div>
                  <div className="email-stat-count">{s.count === null ? "—" : `${n(s.count)} of ${n(data.sends)}`}</div>
                </div>
              ))}
            </div>
            {data.ghlUrl ? (
              <div className="email-stats-foot">
                <span className="note">Delivery and engagement figures are not exposed by GHL's API for workflow emails.</span>
                <a className="btn btn-secondary modal-csv" href={data.ghlUrl} target="_blank" rel="noopener noreferrer">
                  View in GHL
                </a>
              </div>
            ) : null}

            <div className="modal-table-title">Daily sends</div>
            <div className="modal-chart">
              <LineChart
                height={200}
                series={[
                  { label: "Sends per day", color: chartSeries[0], points: data.daily.map((d) => ({ label: d.label, value: d.sends })), format: "count" },
                  { label: "Replies to those sends", color: chartSeries[3], points: data.daily.map((d) => ({ label: d.label, value: d.replies })), format: "count" },
                ]}
              />
            </div>

            <div className="modal-table-title">
              Email preview
              <span className={`pill ${data.preview.source === "template" ? "pill-info" : "pill-warn"} modal-pill`}>
                {data.preview.source === "template" ? "from template" : data.preview.source === "last_send" ? "preview from last send" : "no preview"}
              </span>
            </div>
            <div className="email-preview">
              <div className="email-subject">
                <span className="email-subject-label">Subject</span> {data.preview.subject ?? <span className="note">not available for this send</span>}
              </div>
              {data.preview.html ? (
                <iframe className="email-frame" title="Email preview" sandbox="" srcDoc={data.preview.html} referrerPolicy="no-referrer" />
              ) : (
                <div className="note" style={{ padding: 16 }}>
                  {data.preview.note}
                </div>
              )}
              <div className="note email-preview-note">{data.preview.note}</div>
            </div>

            <Notes notes={data.notes} className="modal-notes" />
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** A clickable template row that opens the email template modal. */
export function EmailTemplateRow({ spec, children }: { spec: EmailTemplateSpec; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <tr
      className="rep-row-click"
      tabIndex={0}
      title="Click for stats, preview, and daily sends"
      onClick={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      {children}
      {open ? <EmailTemplateModal spec={spec} onClose={() => setOpen(false)} /> : null}
    </tr>
  );
}
