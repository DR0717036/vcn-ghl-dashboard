// config/invoices.json: who approves, who is emailed, the sender, and how
// many months the invoice pages list. Read from disk with a change check so
// the owner can edit it without a restart. Server-only.

import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "config", "invoices.json");

export interface InvoicesConfig {
  approvers: string[];
  reviewRecipients: string[];
  from: { name: string; address: string };
  payer: string;
  historyMonths: number;
}

let cache: { mtimeMs: number; cfg: InvoicesConfig } | null = null;

const norm = (e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : "");

export function invoicesConfig(): InvoicesConfig {
  const mtimeMs = fs.statSync(FILE).mtimeMs;
  if (cache && cache.mtimeMs === mtimeMs) return cache.cfg;
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<InvoicesConfig>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(norm).filter(Boolean) : []);
  const cfg: InvoicesConfig = {
    approvers: list(raw.approvers),
    reviewRecipients: list(raw.reviewRecipients),
    from: { name: raw.from?.name?.trim() || "VCN Sales Dashboard", address: norm(raw.from?.address) || "info@intelagentmedia.com" },
    payer: typeof raw.payer === "string" && raw.payer.trim() ? raw.payer.trim() : "Intelagent Media",
    historyMonths: typeof raw.historyMonths === "number" && raw.historyMonths > 0 ? Math.round(raw.historyMonths) : 12,
  };
  cache = { mtimeMs, cfg };
  return cfg;
}

export function isApprover(email: string | null | undefined): boolean {
  return Boolean(email) && invoicesConfig().approvers.includes(norm(email));
}
