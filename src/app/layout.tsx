import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "VCN Sales Dashboard",
  description: "Veteran Careers Network — Go High Level sales dashboard (read-only)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <span className="brand">Veteran Careers Network</span>
            <span className="brand-sub">Sales Dashboard</span>
            <nav className="nav">
              <a href="/mapping">Mapping</a>
            </nav>
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="foot">Read-only view of Go High Level. This dashboard never changes CRM data.</footer>
      </body>
    </html>
  );
}
