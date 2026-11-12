/**
 * What Home's "Explore" says about each screen right now: a headline, a line
 * under it, and a few posters from inside — so a card is a glimpse of the
 * screen rather than a label for it.
 *
 * Everything here is a small read of the database. The one thing that can
 * reach the network is the race calendar (kept in memory for six hours), so
 * it gets a short time limit and the card falls back to its plain caption.
 */
import { and, desc, eq, gt, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MediaKind } from "@/db/schema";
import type { ageFilter } from "./age-filter";
import { addDaysISO } from "./dates";
import { season } from "./f1";
import { friendActivity, friendIds } from "./friends";
import { within } from "./people";
import { picksFor, titlesByIds, universeList } from "./queries";
import { logoUrl, STUDIOS } from "./studios";

export type ExploreTile = {
  /** The headline: "12 new this week". Null falls back to the screen's fixed caption. */
  line: string | null;
  /** Under it: the latest title, the next date, a few names. */
  sub: string | null;
  /** Posters from inside, newest first — or studio logos, for Studios. */
  posters: string[];
};
export type Explore = Record<string, ExploreTile>;

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const key = (r: { tmdbId: number; kind: MediaKind }) => `${r.tmdbId}:${r.kind}`;

/** Up to three posters for these titles, in the order given. */
function postersOf(refs: { tmdbId: number; kind: MediaKind }[]): { posters: string[]; first: string | null } {
  const head = refs.slice(0, 8);
  const titles = titlesByIds(head);
  const found = head.map((r) => titles.get(key(r))).filter((t) => t !== undefined);
  return {
    posters: found.map((t) => t.poster).filter((p): p is string => Boolean(p)).slice(0, 3),
    first: found[0]?.title ?? null,
  };
}

const CAIRO = "Africa/Cairo";
/** "Sun 22 Nov · 6:00 am", in Cairo. */
const raceDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: CAIRO });
const raceTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: CAIRO });

/**
 * `aged` is the viewer's age filter (age-filter.ts), the same one every shelf
 * on Home goes through: a poster or a name left out of those must not turn up
 * here instead.
 */
export async function explore(userId: number | null, today: string, aged: ReturnType<typeof ageFilter>): Promise<Explore> {
  try {
    return await gather(userId, today, aged);
  } catch (e) {
    // Explore is a garnish: if it cannot be read, Home still opens, with the fixed captions.
    console.error("explore:", (e as Error).message);
    return {};
  }
}

async function gather(userId: number | null, today: string, aged: ReturnType<typeof ageFilter>): Promise<Explore> {
  const now = Math.floor(Date.now() / 1000);
  const out: Explore = {};

  // Today: what reached a service this week, newest first.
  const arrivals = await aged(db
    .select({
      tmdbId: schema.titles.tmdbId,
      kind: schema.titles.kind,
      title: schema.titles.title,
      poster: schema.titles.poster,
      releaseDate: schema.titles.releaseDate,
    })
    .from(schema.feedItems)
    .innerJoin(schema.titles, and(eq(schema.titles.tmdbId, schema.feedItems.tmdbId), eq(schema.titles.kind, schema.feedItems.kind)))
    .where(and(eq(schema.feedItems.feed, "new"), isNotNull(schema.titles.poster)))
    .orderBy(desc(schema.titles.releaseDate), schema.feedItems.position)
    .all()
    .filter((f) => (f.releaseDate ?? "") <= today));
  const week = arrivals.filter((f) => (f.releaseDate ?? "") >= addDaysISO(today, -7));
  out.today = {
    line: week.length ? `${week.length} new this week` : null,
    sub: arrivals[0]?.title ?? null,
    posters: arrivals.slice(0, 3).map((f) => f.poster!),
  };

  // Calendar: this week's episodes — of the shows you follow, if you follow any.
  {
    const follows = userId === null ? [] : db
      .select({ tmdbId: schema.follows.tmdbId })
      .from(schema.follows)
      .where(eq(schema.follows.userId, userId))
      .all()
      .map((f) => f.tmdbId);
    const week = db
      .select({ tmdbId: schema.episodes.tmdbId, show: schema.episodes.show, airs: schema.episodes.airs })
      .from(schema.episodes)
      .where(and(
        gte(schema.episodes.airs, today),
        lte(schema.episodes.airs, addDaysISO(today, 6)),
        isNotNull(schema.episodes.tmdbId),
        ...(follows.length ? [inArray(schema.episodes.tmdbId, follows)] : []),
      ))
      .orderBy(schema.episodes.airs)
      .all();
    const shows = await aged(
      [...new Set(week.map((w) => w.tmdbId!))].map((tmdbId) => ({ tmdbId, kind: "tv" as MediaKind })),
    );
    const allowed = new Set(shows.map((x) => x.tmdbId));
    const seen = week.filter((w) => allowed.has(w.tmdbId!));
    const next = seen[0];
    const day = next
      ? next.airs === today
        ? "today"
        : new Date(`${next.airs}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
      : null;
    out.airing = {
      line: seen.length ? `${count(seen.length, "episode")} this week` : null,
      sub: next ? `${next.show} · ${day}` : follows.length ? "Nothing of yours this week" : null,
      posters: postersOf(shows.map((x) => ({ tmdbId: x.tmdbId, kind: "tv" as MediaKind }))).posters,
    };
  }

  // News: the film and TV press in the last day.
  const stories = db
    .select({ title: schema.newsItems.title, image: schema.newsItems.image })
    .from(schema.newsItems)
    .where(and(eq(schema.newsItems.section, "screen"), gt(schema.newsItems.publishedAt, now - 86400)))
    .orderBy(desc(schema.newsItems.publishedAt))
    .all();
  out.news = {
    line: stories.length ? `${count(stories.length, "story", "stories")} today` : null,
    sub: stories[0]?.title ?? null,
    posters: stories.map((s) => s.image).filter((i): i is string => Boolean(i)).slice(0, 2),
  };

  // My List: how much is on it, and the latest saved.
  if (userId !== null) {
    const saved = db
      .select({ tmdbId: schema.verdicts.tmdbId, kind: schema.verdicts.kind })
      .from(schema.verdicts)
      .where(and(eq(schema.verdicts.userId, userId), eq(schema.verdicts.verdict, "watchlist")))
      .orderBy(desc(schema.verdicts.updatedAt))
      .all();
    const followed = db
      .select({ tmdbId: schema.follows.tmdbId })
      .from(schema.follows)
      .where(eq(schema.follows.userId, userId))
      .orderBy(desc(schema.follows.addedAt))
      .all()
      .map((f) => ({ tmdbId: f.tmdbId, kind: "tv" as MediaKind }));
    if (saved.length || followed.length) {
      out.library = {
        line: saved.length ? `${saved.length} saved` : `${followed.length} followed`,
        sub: saved.length && followed.length ? `${count(followed.length, "show")} followed` : null,
        posters: postersOf(await aged([...saved, ...followed])).posters,
      };
    }

    // Friends: what they rated this week, and the latest of it.
    const friends = friendIds(userId);
    if (friends.length) {
      const rated = db
        .select({ n: sql<number>`count(*)` })
        .from(schema.verdicts)
        .where(and(inArray(schema.verdicts.userId, friends), gt(schema.verdicts.updatedAt, now - 7 * 86400)))
        .get();
      const rows = await aged(friendActivity(userId, { page: 1 }).rows);
      const shown = postersOf(rows);
      out.friends = {
        line: rated?.n ? count(rated.n, "new rating") : count(friends.length, "friend"),
        sub: rows[0] && shown.first ? `${rows[0].friend.name} · ${shown.first}` : rated?.n ? "this week" : null,
        posters: shown.posters,
      };
    }

    // Picks (the app's screen): what last night's job chose from your ratings.
    const picks = await aged(picksFor(userId));
    if (picks.length) {
      out.picks = {
        line: `${picks.length} picked for you`,
        sub: picks[0].title,
        posters: picks.map((c) => c.poster).filter((x): x is string => Boolean(x)).slice(0, 3),
      };
    }
  }

  out.studios = {
    line: `${STUDIOS.length} studios`,
    sub: `${STUDIOS.slice(0, 3).map((s) => s.name).join(", ")}…`,
    posters: STUDIOS.slice(0, 3).map((s) => logoUrl(s.logo)),
  };

  // Universes: how many, and the biggest one's best-known films.
  const universes = universeList();
  if (universes.length) {
    const biggest = [...universes].sort((a, b) => b.size - a.size)[0];
    const members = await aged(db
      .select({ tmdbId: schema.titles.tmdbId, kind: schema.titles.kind, poster: schema.titles.poster })
      .from(schema.universeTitles)
      .innerJoin(schema.titles, and(eq(schema.titles.tmdbId, schema.universeTitles.tmdbId), eq(schema.titles.kind, schema.universeTitles.kind)))
      .where(and(eq(schema.universeTitles.slug, biggest.slug), isNotNull(schema.titles.poster)))
      .orderBy(desc(schema.titles.votes))
      .limit(12)
      .all());
    let sub = `${biggest.name} · ${count(biggest.size, "title")}`;
    if (userId !== null && members.length) {
      const seen = db
        .select({ n: sql<number>`count(*)` })
        .from(schema.verdicts)
        .innerJoin(schema.universeTitles, and(eq(schema.universeTitles.tmdbId, schema.verdicts.tmdbId), eq(schema.universeTitles.kind, schema.verdicts.kind)))
        .where(and(
          eq(schema.verdicts.userId, userId),
          eq(schema.universeTitles.slug, biggest.slug),
          inArray(schema.verdicts.verdict, ["love", "like", "dislike", "seen"]),
        ))
        .get();
      if (seen?.n) sub = `${biggest.name} · ${seen.n}/${biggest.size} seen`;
    }
    out.universes = { line: count(universes.length, "universe"), sub, posters: members.slice(0, 3).map((m) => m.poster!) };
  }

  // F1: the next race and when it starts here.
  const races = await within(700, season(), []);
  const next = races.find((r) => Date.parse(r.at) > Date.now());
  if (next) {
    const at = new Date(next.at);
    out.f1 = {
      line: next.name.replace(/ Grand Prix$/, " GP"),
      sub: `${raceDay.format(at)} · ${raceTime.format(at).toLowerCase()}`,
      posters: [],
    };
  }

  return out;
}
