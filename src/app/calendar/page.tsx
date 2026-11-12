import { TvCalendar } from "@/components/TvCalendar";
import { currentUser } from "@/lib/auth";
import { agedEpisodes, ageFilter } from "@/lib/age-filter";
import { monthOf, monthRange, todayISO } from "@/lib/dates";
import { calendarBetween } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar · MOX" };

/** This month's episodes; the page asks /api/calendar for the months either side. */
export default async function CalendarPage() {
  const user = await currentUser();
  const today = todayISO();
  const { from, to } = monthRange(monthOf(today));
  return (
    <TvCalendar
      today={today}
      signedIn={Boolean(user)}
      episodes={await agedEpisodes(ageFilter(user?.id ?? null), calendarBetween(user?.id ?? null, from, to))}
    />
  );
}
