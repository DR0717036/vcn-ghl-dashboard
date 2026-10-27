// "My appointments" for one rep: what is coming up this week and which past
// appointments still have no outcome, from the same appointment rows the
// Appointments section uses (scheduledIn, host = the appointment's assigned
// user). Every row links to the contact in GHL; marking Showed / No-show
// happens in GHL, never here.

import { calendarNames, scheduledIn, STATUS_LABEL, TAG_CLASS_LABEL, type Appt } from "@/lib/appointments";
import { addDays, startOfWeek } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { contactUrl } from "@/lib/drilldown";
import type { Rep } from "@/lib/reps";

export interface ApptRow {
  id: string;
  contactId: string | null;
  name: string;
  ghlUrl: string | null;
  program: string;
  calendar: string;
  status: string;
  startTime: string;
  /** Past rows: how long since the start time. */
  overdueDays: number;
  rescheduled: boolean;
}

export interface RepAppointmentsData {
  upcoming: ApptRow[];
  toMark: ApptRow[];
  weekLabel: string;
  lookbackDays: number;
  notes: string[];
}

const LOOKBACK_DAYS = 60;
const OPEN = new Set(["confirmed", "new", "other"]);

function names(appts: Appt[]): Map<string, string | null> {
  const ids = [...new Set(appts.map((a) => a.contactId).filter((x): x is string => Boolean(x)))];
  const out = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; name: string | null }[]) out.set(c.id, c.name);
  }
  return out;
}

export function computeMyAppointments(rep: Rep, now: Date): RepAppointmentsData {
  const weekEnd = addDays(startOfWeek(now), 7);
  const calendars = calendarNames();
  const mine = (list: Appt[]) => list.filter((a) => a.hostId === rep.userId);
  const upcomingAppts = mine(scheduledIn(now.toISOString(), weekEnd.toISOString())).filter((a) => a.status !== "cancelled" && a.status !== "invalid");
  const pastAppts = mine(scheduledIn(addDays(now, -LOOKBACK_DAYS).toISOString(), now.toISOString())).filter((a) => OPEN.has(a.status));
  const contactName = names([...upcomingAppts, ...pastAppts]);
  const row = (a: Appt): ApptRow => ({
    id: a.id,
    contactId: a.contactId,
    name: (a.contactId ? contactName.get(a.contactId) : null) ?? "(no name)",
    ghlUrl: a.contactId ? contactUrl(a.contactId) : null,
    program: TAG_CLASS_LABEL[a.cls],
    calendar: a.calendarId ? (calendars.get(a.calendarId) ?? a.calendarId) : "—",
    status: STATUS_LABEL[a.status] + (a.status === "other" && a.rawStatus ? ` (${a.rawStatus})` : ""),
    startTime: a.startTime ?? "",
    overdueDays: a.startTime ? Math.max(0, (now.getTime() - Date.parse(a.startTime)) / 86_400_000) : 0,
    rescheduled: Boolean(a.rescheduledAt),
  });
  return {
    upcoming: upcomingAppts.map(row).sort((a, b) => (a.startTime < b.startTime ? -1 : 1)),
    toMark: pastAppts.map(row).sort((a, b) => (a.startTime < b.startTime ? -1 : 1)),
    weekLabel: "through Sunday",
    lookbackDays: LOOKBACK_DAYS,
    notes: [
      "Upcoming — appointments you host (the appointment's assigned user) that start between now and the end of this week (Sunday night, New York), not cancelled.",
      `Mark the outcome — appointments you hosted in the last ${LOOKBACK_DAYS} days whose start time has passed but whose calendar status is still open (Confirmed or New): record Showed or No-show in GHL so your show rate and the team's are right. Showed is the only status that counts as completed.`,
      "Army / Veteran — the contact's current tags. Rescheduled — GHL stamped the appointment as rescheduled at least once.",
      "Links open the contact in GHL; nothing here changes GHL.",
    ],
  };
}
