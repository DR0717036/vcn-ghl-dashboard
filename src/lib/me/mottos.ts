// Short motivational lines for the rep dashboard, written for this dashboard
// (no attributed quotes). One rotates in each New York day.

import { nyParts } from "@/lib/dates";

export const MOTTOS: string[] = [
  "Every dial is a door. Knock on enough of them and one opens today.",
  "The quota is a month long. Today only has to be a little better than yesterday.",
  "A submission is just a conversation you finished. Start another one.",
  "Pipelines don't fill themselves. Your next call is the pump.",
  "The retro rate is waiting for whoever keeps going. Keep going.",
  "No-shows happen. Reschedules win. Pick up the phone.",
  "Small streaks turn into big months. Protect this week.",
  "The best time to call was an hour ago. The second best time is now.",
  "Five submissions a week is one good conversation a day.",
  "Someone on your list is ready today. Find them.",
  "Talk time is practice time. Every minute makes the next call easier.",
  "Follow-ups are where the month is won. Clear the list.",
  "A veteran's next chapter can start with your call. Make it.",
  "Pace beats panic. One clean day at a time.",
  "Your goal line is on the chart. Put a bar over it.",
  "Unread replies are warm leads. Answer them first.",
  "The team average is a floor, not a ceiling.",
  "Objections are questions in disguise. Answer the question.",
  "You don't need a perfect day. You need a full one.",
  "Mark your appointments. A show you didn't record is a win nobody sees.",
  "Momentum is built before lunch. Load the morning.",
  "Last week is data. This week is the game.",
  "A stale lead is just a conversation that paused. Restart it.",
  "The difference between #3 and #1 is usually a few more dials a day.",
  "Confirm the appointment, then confirm it again. Shows pay.",
  "Every month starts at zero for everyone. Start faster.",
  "Your next submission is already in your pipeline. Go find it.",
  "Consistency is the quiet superpower. Show up the same on slow days.",
  "Ask for the next step on every call. Then take it.",
  "Finish the week the way you'd want it to show on the leaderboard.",
];

/** The line for the New York calendar day of `now`: rotates through the list once a day. */
export function dailyMotto(now: Date): string {
  const p = nyParts(now);
  const start = Date.UTC(p.y, 0, 1);
  const day = Math.floor((Date.UTC(p.y, p.m - 1, p.d) - start) / 86_400_000);
  return MOTTOS[(day + p.y) % MOTTOS.length];
}
