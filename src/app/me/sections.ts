// The rep dashboard's sections (owner request 2026-10-26): ids for the band
// anchors, names, one-line descriptions, and the icon each one uses. Shared
// by the band headings and the dock, like the admin scorecard's sections.

import type { Section } from "../sections";

export const ME_SECTIONS: Section[] = [
  { id: "me-overview", name: "My overview", desc: "Momentum this week, next milestone, bounties and your rank", icon: "won" },
  { id: "me-submissions", name: "My submissions", desc: "Army CA 101, Supervisor Approval with the 5-day deadlines, IAU App by semester, Accepted, Enrolled / Won — your rows of the Submissions section", icon: "submissions" },
  { id: "me-pace", name: "My pace", desc: "Month to date vs quota, projection, needed per day, weekly goal", icon: "submissions" },
  { id: "me-activity", name: "My activity", desc: "Your calls and talk time vs your goals, call outcomes, first call of the day, best times to call", icon: "activity" },
  { id: "me-appointments", name: "My appointments", desc: "Upcoming this week, outcomes to mark, booking and show rates, outcomes, NGT, post-appointment losses, Army vs Veteran", icon: "appointments" },
  { id: "me-pipeline", name: "My pipeline", desc: "Leads that need a call, and your contacts by stage, Army and Veteran", icon: "conversations" },
  { id: "me-invoices", name: "My invoices", desc: "This pay period's attendance, then every bi-weekly base and monthly commission invoice with its status and a Send button once the period has ended", icon: "won" },
];
