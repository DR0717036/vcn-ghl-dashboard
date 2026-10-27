// Invoice status pill (Draft / Submitted / Approved / Paid, or Live preview
// for the month in progress). Shared by the invoice list and detail pages.

import { STATUS_LABEL } from "@/lib/invoices/service";
import type { InvoiceStatus } from "@/lib/invoices/store";

const PILL: Record<InvoiceStatus, string> = { draft: "pill-neutral", submitted: "pill-info", approved: "pill-ok", paid: "pill-gold" };

export default function StatusPill({ status, current }: { status: InvoiceStatus; current?: boolean }) {
  if (current) return <span className="pill pill-neutral">Live preview</span>;
  return <span className={`pill ${PILL[status]}`}>{STATUS_LABEL[status]}</span>;
}
