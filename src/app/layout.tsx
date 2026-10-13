import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";
import "@/styles/tokens.css";
import "@/styles/base.css";

// Self-hosted by Next.js at build time: no request to Google Fonts at runtime.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VCN Sales Dashboard",
  description: "Veteran Careers Network sales dashboard on Go High Level data (read-only)",
  icons: { icon: "/vcn-logo.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <header className="topbar topbar-sticky">
          <div className="topbar-inner">
            <a className="brand" href="/">
              {/* VCN logo (public/vcn-logo.png), left of the title; Intelagent branding everywhere else. */}
              <img className="brand-logo" src="/vcn-logo.png" alt="Veteran Careers Network" width={44} height={44} />
              <span>VCN Sales Dashboard</span>
            </a>
            <span className="brand-sub">by Intelagent Media</span>
            <nav className="nav">
              <a href="/">Scorecard</a>
              <a href="/mapping">Mapping</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="foot">Read-only view of Go High Level. This dashboard never changes CRM data.</footer>
      </body>
    </html>
  );
}
