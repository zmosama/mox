/** Date formatting shared by the calendar and the release timeline. */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const APP_TIME_ZONE = "Africa/Cairo";

/** Calendar date in Cairo, independent of echo's or the browser's host zone. */
export function todayISO(now = new Date(), timeZone = APP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Add whole calendar days to an ISO date without crossing a host timezone. */
export function addDaysISO(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "Today", "Tomorrow", else "Thu 27 Aug". */
export function dayLabel(iso: string, today: string): string {
  if (!iso) return "Undated";
  const at = new Date(`${iso}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  const days = Math.round((at.getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return `${DAYS[(at.getUTCDay() + 6) % 7]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

export const episodeCode = (season: number, episode: number) =>
  `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
