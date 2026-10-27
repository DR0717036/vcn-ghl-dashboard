// The rep dashboard's sections (owner request 2026-10-26): ids for the band
// anchors, names, one-line descriptions, and the icon each one uses. Shared
// by the band headings and the dock, like the admin scorecard's sections.

import type { Section } from "../sections";

export const ME_SECTIONS: Section[] = [
  { id: "me-scorecard", name: "My scorecard", desc: "Today, this week, this month, against your own goals", icon: "activity" },
  { id: "me-pace", name: "My pace", desc: "Month to date vs quota, projection, needed per day, weekly streak", icon: "submissions" },
  { id: "me-commission", name: "My commission", desc: "This month's estimate with the calculation, month by month", icon: "won" },
  { id: "me-leads", name: "My leads", desc: "Assigned leads that need action", icon: "leads" },
  { id: "me-appointments", name: "My appointments", desc: "Upcoming this week and outcomes to mark", icon: "appointments" },
  { id: "me-pipeline", name: "My pipeline", desc: "Your contacts by stage, Army and Veteran", icon: "conversations" },
  { id: "me-leaderboard", name: "Team leaderboard", desc: "The whole team, ranked, with you highlighted", icon: "reps" },
  { id: "me-calltimes", name: "Best call times", desc: "Your own answered-rate heat map", icon: "activity" },
];

/** The sections built so far; the rest are added step by step. */
export const ME_SECTIONS_LIVE: Section[] = ME_SECTIONS.slice(0, 1);
