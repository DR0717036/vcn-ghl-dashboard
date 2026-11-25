// The payroll invoice PDF (owner request 2026-11-24): Letter pages with the
// built-in Helvetica fonts, an Intelagent-branded header, the invoice block
// (number, rep, period, status), a line-item table that breaks across
// pages, the totals (base, deductions, bounties, commission, total), the
// payment terms, and notes. Text is WinAnsi; other characters become "?".
// Nothing here touches GHL.

import type { PayrollLine, PayrollTotals } from "./store";

export interface PayrollPdf {
  number: string;
  title: string;
  typeLabel: string;
  status: string;
  repName: string;
  periodLabel: string;
  payer: string;
  paymentTerms: string;
  generatedAt: string;
  lines: PayrollLine[];
  totals: PayrollTotals;
  summary: string;
  notes: string[];
}

const W = 612;
const H = 792;
const MARGIN = 48;
const ROW_H = 16;
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const WINANSI: Record<string, number> = { "–": 0x96, "—": 0x97, "•": 0x95, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "€": 0x80, "™": 0x99, "½": 0xbd, "×": 0xd7, "÷": 0xf7, "·": 0xb7 };

function pdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 63;
    const mapped = WINANSI[ch];
    const c = mapped !== undefined ? String.fromCharCode(mapped) : code < 32 || code > 255 ? "?" : ch;
    out += c === "\\" ? "\\\\" : c === "(" ? "\\(" : c === ")" ? "\\)" : c;
  }
  return out;
}

function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += /[0-9]/.test(ch) ? 0.556 : /[A-Z]/.test(ch) ? 0.69 : /[ .,:;'|il!tfrjI]/.test(ch) ? 0.3 : /[mwMW]/.test(ch) ? 0.85 : 0.56;
  return w * size;
}

function clip(s: string, size: number, maxWidth: number): string {
  if (textWidth(s, size) <= maxWidth) return s;
  let t = s;
  while (t.length > 1 && textWidth(t + "...", size) > maxWidth) t = t.slice(0, -1);
  return t + "...";
}

class Page {
  ops: string[] = [];
  text(x: number, y: number, s: string, size = 10, bold = false, align: "left" | "right" = "left", gray = 0): void {
    const xx = align === "right" ? x - textWidth(s, size) : x;
    this.ops.push(`${gray} g BT /${bold ? "F2" : "F1"} ${size} Tf ${xx.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(s)}) Tj ET 0 g`);
  }
  rule(x1: number, y: number, x2: number, width = 0.6, gray = 0.75): void {
    this.ops.push(`${gray} G ${width} w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`);
  }
  box(x: number, y: number, w: number, h: number, gray = 0.94): void {
    this.ops.push(`${gray} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  }
  /** A filled bar in the brand navy (RGB), for the header band. */
  band(x: number, y: number, w: number, h: number): void {
    this.ops.push(`0.07 0.14 0.25 rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  }
  white(x: number, y: number, s: string, size = 10, bold = false, align: "left" | "right" = "left"): void {
    const xx = align === "right" ? x - textWidth(s, size) : x;
    this.ops.push(`1 g BT /${bold ? "F2" : "F1"} ${size} Tf ${xx.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(s)}) Tj ET 0 g`);
  }
}

const COLS = [
  { label: "Date", x: MARGIN, w: 72, align: "left" as const },
  { label: "Item", x: MARGIN + 78, w: 150, align: "left" as const },
  { label: "Detail", x: MARGIN + 234, w: 186, align: "left" as const },
  { label: "Rate", x: W - MARGIN - 70, w: 60, align: "right" as const },
  { label: "Amount", x: W - MARGIN, w: 66, align: "right" as const },
];

export function renderPayrollPdf(inv: PayrollPdf): Buffer {
  const pages: Page[] = [];
  let page = new Page();
  pages.push(page);
  let y = H;

  // Branded header band
  page.band(0, H - 70, W, 70);
  page.white(MARGIN, H - 32, "INTELAGENT MEDIA", 16, true);
  page.white(MARGIN, H - 50, "Veteran Careers Network · Sales Dashboard", 9);
  page.white(W - MARGIN, H - 32, inv.number, 13, true, "right");
  page.white(W - MARGIN, H - 50, inv.typeLabel, 9, false, "right");
  y = H - 70 - 28;

  page.text(MARGIN, y, inv.title, 15, true);
  page.text(W - MARGIN, y, `Status: ${inv.status}`, 10, false, "right");
  y -= 18;
  page.text(MARGIN, y, `Rep: ${inv.repName}`, 11, true);
  page.text(W - MARGIN, y, `Generated: ${inv.generatedAt}`, 9, false, "right", 0.35);
  y -= 15;
  page.text(MARGIN, y, `Period: ${inv.periodLabel}`, 10);
  y -= 14;
  page.text(MARGIN, y, `Payable by: ${inv.payer}`, 10);
  y -= 10;
  page.rule(MARGIN, y, W - MARGIN, 1, 0.2);
  y -= 22;

  const header = () => {
    page.box(MARGIN - 4, y - 5, W - 2 * MARGIN + 8, ROW_H + 2);
    for (const c of COLS) page.text(c.x, y, c.label, 9, true, c.align);
    y -= ROW_H + 4;
  };
  const newPage = () => {
    page = new Page();
    pages.push(page);
    y = H - MARGIN;
    page.text(MARGIN, y - 8, `${inv.title} · ${inv.number} (continued)`, 11, true);
    y -= 28;
    header();
  };

  header();
  if (inv.lines.length === 0) {
    page.text(MARGIN, y, "No line items.", 10);
    y -= ROW_H;
  }
  for (const l of inv.lines) {
    if (y < MARGIN + 110) newPage();
    const muted = l.kind === "day" && l.amount === 0;
    const sign = l.amount < 0 ? "-" : l.kind === "extra" ? "+" : "";
    page.text(COLS[0].x, y, l.day, 9, false, "left", muted ? 0.45 : 0);
    page.text(COLS[1].x, y, clip(l.label, 9, COLS[1].w), 9, l.kind === "base" || l.kind === "bounty", "left", muted ? 0.45 : 0);
    page.text(COLS[2].x, y, clip(l.detail, 9, COLS[2].w), 9, false, "left", muted ? 0.45 : 0);
    page.text(COLS[3].x, y, l.rate === null ? "" : usd(l.rate), 9, false, "right", muted ? 0.45 : 0);
    page.text(COLS[4].x, y, muted ? (l.label.startsWith("Holiday") ? "no deduction" : "included") : sign + usd(Math.abs(l.amount)), 9, !muted, "right", muted ? 0.45 : 0);
    page.rule(MARGIN, y - 4, W - MARGIN, 0.4, 0.85);
    y -= ROW_H;
  }

  // Totals
  if (y < MARGIN + 150) newPage();
  y -= 6;
  page.rule(MARGIN, y + 2, W - MARGIN, 1, 0.2);
  y -= 16;
  const t = inv.totals;
  const row = (label: string, v: number, bold = false, size = 10) => {
    page.text(W - MARGIN - 90, y, label, size, false, "right");
    page.text(W - MARGIN, y, (v < 0 ? "-" : "") + usd(Math.abs(v)), size, bold, "right");
    y -= size + 7;
  };
  if (t.base > 0) row("Base pay", t.base);
  if (t.deductions !== 0) row("Non-paid days", -Math.abs(t.deductions));
  if (t.extras > 0) row("Optional days worked", t.extras);
  if (t.bounties > 0) row("Bounties", t.bounties);
  if (t.commission > 0) row("Commission", t.commission);
  y -= 4;
  page.text(W - MARGIN - 90, y, "Total due", 12, true, "right");
  page.text(W - MARGIN, y, usd(t.total), 14, true, "right");
  y -= 22;
  if (inv.summary) {
    page.text(MARGIN, y, clip(inv.summary, 9, W - 2 * MARGIN), 9, false, "left", 0.3);
    y -= 16;
  }

  // Payment terms + notes
  const paragraph = (text: string, size: number, gray = 0.3) => {
    const words = text.split(" ");
    let line = "";
    const maxW = W - 2 * MARGIN;
    const flush = () => {
      if (y < MARGIN + 20) newPage();
      page.text(MARGIN, y, line, size, false, "left", gray);
      y -= size + 3;
      line = "";
    };
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (textWidth(cand, size) > maxW) flush();
      line = line ? `${line} ${w}` : w;
    }
    if (line) flush();
    y -= 4;
  };
  if (inv.paymentTerms) {
    page.text(MARGIN, y, "Payment terms", 9, true);
    y -= 13;
    paragraph(inv.paymentTerms, 9, 0.1);
  }
  for (const nt of inv.notes) paragraph(nt, 8);

  pages.forEach((p, i) => p.text(W / 2 - 20, MARGIN / 2, `Page ${i + 1} of ${pages.length}`, 8, false, "left", 0.4));
  return assemble(pages);
}

function assemble(pages: Page[]): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add("");
  const pagesObj = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  for (const p of pages) {
    const content = p.ops.join("\n");
    const stream = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${stream} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let out = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
