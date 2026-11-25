// Invoices (payroll flow, owner request 2026-11-24). A rep sees their
// attendance and their own invoices (bi-weekly base and monthly commission)
// with a Send button once a period has ended; an admin gets the admin page
// (src/app/invoices/AdminInvoices.tsx: filters, approvals, mark paid,
// attendance overrides, PDF / CSV) or a rep's own view with ?as=<GHL user
// id>. Nothing here touches GHL.

import { requirePageUser } from "@/lib/guard";
import { repViewOf } from "@/lib/me/context";
import { attendanceForNow } from "@/lib/payroll/attendance";
import { repInvoices } from "@/lib/payroll/invoices";
import { salesReps, type Rep } from "@/lib/reps";
import { redirect } from "next/navigation";
import AttendanceCard from "../me/AttendanceCard";
import InvoicesSection from "../me/InvoicesSection";
import AdminInvoices from "./AdminInvoices";
import type { AdminFilters } from "@/lib/payroll/admin";
import type { InvoiceType, PayrollStatus } from "@/lib/payroll/store";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function RepInvoices({ rep, viewingAs }: { rep: Rep; viewingAs: boolean }) {
  const now = new Date();
  const asQuery = viewingAs ? `?as=${encodeURIComponent(rep.userId)}` : "";
  return (
    <section className="band band-dark inv-page">
      <div className="band-inner">
        {viewingAs ? (
          <div className="callout callout-info me-viewing">
            <b>Admin view.</b> {rep.name}&rsquo;s invoices exactly as they see them. <a href="/invoices">Back to the admin Invoices page</a>
          </div>
        ) : null}
        <h1 className="page-title">My invoices</h1>
        <div className="kpi-row cols-1">
          <AttendanceCard a={attendanceForNow(rep, now)} visible />
        </div>
        <InvoicesSection inv={repInvoices(rep, now)} asQuery={asQuery} canSend={!viewingAs} name={rep.name} visible />
      </div>
    </section>
  );
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const asParam = first(sp.as);
  const user = await requirePageUser(asParam ? `/invoices?as=${encodeURIComponent(asParam)}` : "/invoices");
  if (user.role === "rep") {
    const rep = salesReps.find((r) => r.userId === user.repUserId);
    if (!rep) redirect("/login?error=Configuration");
    const view = repViewOf(rep, user, false);
    return <RepInvoices rep={view.rep} viewingAs={false} />;
  }
  if (asParam) {
    const rep = salesReps.find((r) => r.userId === asParam);
    if (rep) return <RepInvoices rep={rep} viewingAs />;
  }
  const focus = Number(first(sp.focus));
  const f: AdminFilters = {
    rep: first(sp.rep) || undefined,
    type: (["base", "commission"].includes(first(sp.type) ?? "") ? first(sp.type) : "") as InvoiceType | "",
    status: (["draft", "submitted", "approved", "paid"].includes(first(sp.status) ?? "") ? first(sp.status) : "") as PayrollStatus | "",
    period: first(sp.period)?.trim() || undefined,
  };
  return <AdminInvoices f={f} focus={Number.isFinite(focus) && focus > 0 ? focus : null} email={user.email} />;
}
