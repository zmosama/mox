import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { seriesProgress, type SeriesShape } from "@/lib/progress";
import { tmdb } from "@/lib/tmdb";
import { chosenServices } from "@/lib/people";

/** One season of a series, episode by episode, for the season picker. */
export async function GET(_: Request, { params }: { params: Promise<{ kind: string; id: string; season: string }> }) {
  const { kind, id, season } = await params;
  if (kind !== "tv") return NextResponse.json({ error: "Only a series has seasons" }, { status: 404 });
  const tmdbId = Number(id);
  const n = Number(season);
  if (!Number.isInteger(tmdbId) || !Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "No such season" }, { status: 404 });
  }
  let show: SeriesShape;
  try {
    // The same request, and so the same cache entry, as the title page's.
    show = await tmdb<SeriesShape>(`/tv/${tmdbId}`, { append_to_response: "credits,watch/providers,videos" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  const user = await currentUser();
  const progress = await seriesProgress(tmdbId, show, user?.id ?? null, todayISO(), n, chosenServices(user?.id ?? null));
  if (!progress || progress.season !== n) return NextResponse.json({ error: "No such season" }, { status: 404 });
  return NextResponse.json(progress, { headers: { "cache-control": "no-store" } });
}
