// The six scorecard sections: ids for the band anchors, names, one-line
// descriptions, and the icon each one uses (SectionIcon.tsx). Shared by the
// band headings and the slide-in side navigation.

export type SectionIconName = "submissions" | "activity" | "conversations" | "appointments" | "leads" | "won";

export interface Section {
  id: string;
  name: string;
  desc: string;
  icon: SectionIconName;
}

export const SECTIONS: Section[] = [
  { id: "sec-submissions", name: "Submissions", desc: "CA 101 and IAU applications, goals and commission", icon: "submissions" },
  { id: "sec-activity", name: "Activity", desc: "Dials, talk time, best times to call", icon: "activity" },
  { id: "sec-conversations", name: "Conversations", desc: "Response times, opt-outs, template performance", icon: "conversations" },
  { id: "sec-appointments", name: "Appointments", desc: "Booked, showed, cancelled, outcomes", icon: "appointments" },
  { id: "sec-leads", name: "Leads", desc: "New leads, campaigns, sources, stale leads", icon: "leads" },
  { id: "sec-won", name: "Won Opportunities", desc: "Won deals, value, past semesters, close rates", icon: "won" },
];
