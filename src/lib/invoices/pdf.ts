// A small PDF writer for the commission invoice: Letter pages, the built-in
// Helvetica fonts (no font files, no library), text and rules only. Enough
// for a header block, a line-item table that breaks across pages, totals,
// and the "estimated" note. Text is written in WinAnsi encoding; characters
// outside it become "?". Nothing here touches GHL.

export interface PdfInvoice {
  number: string;
  title: string;
  status: string;
  repName: string;
  monthLabel: string;
  periodLabel: string;
  payer: string;
  planText: string;
  generatedAt: string;
  lines: { eventDay: string; contactName: string; program: string; event: string; rate: number; amount: number; tier: string }[];
  calc: string;
  total: number;
  notes: string[];
}

const W = 612;
const H = 792;
const MARGIN = 48;
const ROW_H = 16;

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Characters outside Latin-1 that WinAnsi does encode (dashes, bullets, quotes, ellipsis), mapped to their byte. */
const WINANSI: Record<string, number> = { "–": 0x96, "—": 0x97, "•": 0x95, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "€": 0x80, "™": 0x99 };

/** WinAnsi-safe, escaped for a PDF string literal; anything else becomes "?". */
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

/** Approximate Helvetica width at size 1 (digits 0.556 em, capitals 0.69, lowercase 0.56, narrow glyphs 0.3, wide 0.85). */
function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += /[0-9]/.test(ch) ? 0.556 : /[A-Z]/.test(ch) ? 0.69 : /[ .,:;'|il!tfrjI]/.test(ch) ? 0.3 : /[mwMW]/.test(ch) ? 0.85 : 0.56;
  return w * size;
}

function clip(s: string, size: number, maxWidth: number): string {
  if (textWidth(s, size) <= maxWidth) return s;
  let t = s;
  while (t.length > 1 && textWidth(t + "…", size) > maxWidth) t = t.slice(0, -1);
  return t + "...";
}

class Page {
  ops: string[] = [];
  text(x: number, y: number, s: string, size = 10, bold = false, align: "left" | "right" = "left"): void {
    const xx = align === "right" ? x - textWidth(s, size) : x;
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${xx.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(s)}) Tj ET`);
  }
  rule(x1: number, y: number, x2: number, width = 0.6, gray = 0.75): void {
    this.ops.push(`${gray} G ${width} w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`);
  }
  box(x: number, y: number, w: number, h: number, gray = 0.94): void {
    this.ops.push(`${gray} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  }
}

// Column x positions (points); right-aligned columns give their right edge. Event ends before the Rate column's widest value.
const COLS = [
  { key: "eventDay", label: "Date", x: MARGIN, w: 64, align: "left" as const },
  { key: "contactName", label: "Contact", x: MARGIN + 68, w: 132, align: "left" as const },
  { key: "program", label: "Program", x: MARGIN + 204, w: 90, align: "left" as const },
  { key: "event", label: "Event", x: MARGIN + 298, w: 124, align: "left" as const },
  { key: "rate", label: "Rate", x: W - MARGIN - 62, w: 56, align: "right" as const },
  { key: "amount", label: "Amount", x: W - MARGIN, w: 60, align: "right" as const },
];

export function renderInvoicePdf(inv: PdfInvoice): Buffer {
  const pages: Page[] = [];
  let page = new Page();
  pages.push(page);
  let y = H - MARGIN;

  // Header
  page.text(MARGIN, y - 8, inv.title, 18, true);
  page.text(W - MARGIN, y - 8, inv.number, 12, true, "right");
  y -= 26;
  page.text(MARGIN, y, `${inv.repName} · ${inv.monthLabel}`, 12, true);
  page.text(W - MARGIN, y, `Status: ${inv.status}`, 10, false, "right");
  y -= 16;
  page.text(MARGIN, y, `Period: ${inv.periodLabel}`, 10);
  page.text(W - MARGIN, y, `Generated: ${inv.generatedAt}`, 9, false, "right");
  y -= 14;
  page.text(MARGIN, y, `Payable by: ${inv.payer}`, 10);
  y -= 14;
  page.text(MARGIN, y, `Plan: ${clip(inv.planText, 9, W - 2 * MARGIN - 40)}`, 9);
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
    page.text(MARGIN, y, "No commission-earning events this month.", 10);
    y -= ROW_H;
  }
  for (const l of inv.lines) {
    if (y < MARGIN + 90) newPage();
    page.text(COLS[0].x, y, l.eventDay, 9);
    page.text(COLS[1].x, y, clip(l.contactName, 9, COLS[1].w), 9);
    page.text(COLS[2].x, y, clip(l.program, 9, COLS[2].w), 9);
    page.text(COLS[3].x, y, clip(l.tier ? `${l.event} (${l.tier})` : l.event, 9, COLS[3].w), 9);
    page.text(COLS[4].x, y, usd(l.rate), 9, false, "right");
    page.text(COLS[5].x, y, usd(l.amount), 9, true, "right");
    page.rule(MARGIN, y - 4, W - MARGIN, 0.4, 0.85);
    y -= ROW_H;
  }

  // Totals
  if (y < MARGIN + 120) newPage();
  y -= 6;
  page.rule(MARGIN, y + 2, W - MARGIN, 1, 0.2);
  y -= 16;
  page.text(W - MARGIN - 74, y, "Calculation", 9, false, "right");
  page.text(W - MARGIN, y, inv.calc, 9, false, "right");
  y -= 18;
  page.text(W - MARGIN - 74, y, "Total (estimated)", 11, true, "right");
  page.text(W - MARGIN, y, usd(inv.total), 13, true, "right");
  y -= 26;

  // Notes
  for (const n of inv.notes) {
    const words = n.split(" ");
    let line = "";
    const maxW = W - 2 * MARGIN;
    const flush = () => {
      if (y < MARGIN + 20) newPage();
      page.text(MARGIN, y, line, 8);
      y -= 11;
      line = "";
    };
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (textWidth(cand, 8) > maxW) flush();
      line = line ? `${line} ${w}` : w;
    }
    if (line) flush();
    y -= 3;
  }

  // Page numbers
  pages.forEach((p, i) => p.text(W / 2, MARGIN / 2, `Page ${i + 1} of ${pages.length}`, 8, false, "left"));

  return assemble(pages);
}

/** Writes the objects and the cross-reference table (offsets in bytes, latin1). */
function assemble(pages: Page[]): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length; // object number
  };
  const catalog = add(""); // 1, filled later
  const pagesObj = add(""); // 2
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  for (const p of pages) {
    const content = p.ops.join("\n");
    const stream = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    const id = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${stream} 0 R >>`);
    pageIds.push(id);
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
