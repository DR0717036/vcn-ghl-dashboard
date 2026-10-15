// "How this is counted" renderer shared by every card and modal.
//
// Each note is a plain string in one of three shapes:
//   "Term — explanation"   → bold term, a dash, then the explanation
//   "Limitation: …"        → gathered into one italic "Limitations" line at the end
//   anything else          → rendered as written
// Lists with more than six items flow into two columns on wide screens.

import type { ReactNode } from "react";

const SEP = " — ";
const LIMIT = "Limitation: ";

export function splitNote(t: string): { term: string | null; text: string } {
  const i = t.indexOf(SEP);
  if (i > 0 && i < 48) return { term: t.slice(0, i), text: t.slice(i + SEP.length) };
  return { term: null, text: t };
}

export default function Notes({ notes, title = "How this is counted", className = "" }: { notes: ReactNode[]; title?: string | null; className?: string }) {
  const items: ReactNode[] = [];
  const limits: string[] = [];
  for (const t of notes) {
    if (typeof t !== "string") {
      if (t) items.push(t);
      continue;
    }
    const s = t.trim();
    if (!s) continue;
    if (s.startsWith(LIMIT)) {
      const l = s.slice(LIMIT.length).trim();
      limits.push(l.charAt(0).toUpperCase() + l.slice(1));
      continue;
    }
    const { term, text } = splitNote(s);
    items.push(
      term ? (
        <>
          <b>{term}</b>
          {SEP}
          {text}
        </>
      ) : (
        text
      ),
    );
  }
  if (items.length === 0 && limits.length === 0) return null;
  return (
    <div className={`notes${items.length > 6 ? " notes-cols" : ""} ${className}`.trim()}>
      {title ? <div className="label kpi-notes-title">{title}</div> : null}
      {items.length > 0 ? (
        <ul className="notes-list">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : null}
      {limits.length > 0 ? (
        <p className="notes-limits">
          <i>
            <b>Limitations</b>
            {SEP}
            {limits.map((l, i) => (
              <span key={i}>
                {l}
                {i < limits.length - 1 ? " " : ""}
              </span>
            ))}
          </i>
        </p>
      ) : null}
    </div>
  );
}
