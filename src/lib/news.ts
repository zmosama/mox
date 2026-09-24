/**
 * The News tab: what happened today that you would want to know.
 *
 * Two halves. "Your updates" is built from mox's own data and needs no
 * newsroom: a season of a show you follow about to start, something on your
 * watchlist that just reached one of your services, new work from people you
 * follow. "Headlines" are the film and TV press in English and Arabic,
 * ranked by the rules in news-rules.ts — first what names something you care
 * for, then the rest of the day's screen news, newest first.
 *
 * Feeds are read on demand, at most every half hour, and kept a fortnight.
 */
import { and, desc, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MediaKind } from "@/db/schema";
import { addDaysISO, todayISO } from "./dates";
import { newFromPeople, followedPeople, within } from "./people";
import type { NewsLang } from "./prefs";
import { followsFor, library, tasteFor, titlesByIds, verdictsFor } from "./queries";
import {
  buildMatchers, isList, isSoon, onTopic, parseFeed, scoreItem, thumbnail, type Interest,
} from "./news-rules";

export const SOURCES: { id: string; name: string; url: string; lang: NewsLang }[] = [
  { id: "variety", name: "Variety", url: "https://variety.com/feed/", lang: "en" },
  { id: "deadline", name: "Deadline", url: "https://deadline.com/feed/", lang: "en" },
  { id: "thr", name: "The Hollywood Reporter", url: "https://www.hollywoodreporter.com/feed/", lang: "en" },
  { id: "indiewire", name: "IndieWire", url: "https://www.indiewire.com/feed/", lang: "en" },
  { id: "collider", name: "Collider", url: "https://collider.com/feed/", lang: "en" },
  { id: "youm7", name: "اليوم السابع", url: "https://www.youm7.com/rss/SectionRss?SectionID=48", lang: "ar" },
  { id: "cnnar", name: "CNN بالعربية", url: "https://arabic.cnn.com/entertainment/rss", lang: "ar" },
];

const REFRESH_SECONDS = 30 * 60;
const KEEP_DAYS = 14;
let lastRefresh = 0;
let refreshing: Promise<void> | null = null;

async function fetchSource(source: (typeof SOURCES)[number]) {
  const res = await fetch(source.url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; mox; +https://mox.mosama.me)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${source.name} answered ${res.status}`);
  return parseFeed(await res.text()).filter((item) => onTopic(item, source.lang));
}

/**
 * Read every feed and keep what is new. One feed failing leaves its old
 * stories in place and costs the others nothing.
 */
export async function refreshNews(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  db.transaction((tx) => {
    results.forEach((result, i) => {
      if (result.status !== "fulfilled") return;
      const source = SOURCES[i];
      for (const item of result.value) {
        tx.insert(schema.newsItems)
          .values({
            url: item.url,
            source: source.id,
            lang: source.lang,
            title: item.title,
            summary: item.summary,
            image: item.image,
            categories: JSON.stringify(item.categories),
            // A story dated in the future is a feed's clock, not news from tomorrow.
            publishedAt: Math.min(item.publishedAt, now),
          })
          .onConflictDoNothing()
          .run();
      }
    });
    tx.delete(schema.newsItems).where(lt(schema.newsItems.publishedAt, now - KEEP_DAYS * 86400)).run();
  });
  lastRefresh = Date.now();
}

/**
 * Fresh enough to show. With nothing stored yet the caller waits for the
 * first read; otherwise a stale store is shown at once and refreshed behind it.
 */
async function ensureFresh() {
  if (Date.now() - lastRefresh < REFRESH_SECONDS * 1000) return;
  refreshing ??= refreshNews().finally(() => { refreshing = null; });
  const any = db.select({ url: schema.newsItems.url }).from(schema.newsItems).limit(1).get();
  if (!any) await refreshing.catch(() => {});
}

// ------------------------------------------------------------------ interests

/** Everything a story could name that you would care about, and what you would not. */
function interestsOf(userId: number): Interest[] {
  const out: Interest[] = [];
  const follows = followsFor(userId);
  const verdicts = verdictsFor(userId);

  const ids = [
    ...[...follows].map((tmdbId) => ({ tmdbId, kind: "tv" as MediaKind })),
    ...[...verdicts.keys()].map((k) => {
      const [tmdbId, kind] = k.split(":");
      return { tmdbId: Number(tmdbId), kind: kind as MediaKind };
    }),
  ];
  const titles = titlesByIds(ids);
  const name = (tmdbId: number, kind: MediaKind) => titles.get(`${tmdbId}:${kind}`)?.title;

  for (const tmdbId of follows) {
    const n = name(tmdbId, "tv");
    if (n) out.push({ name: n, kind: "follow" });
  }
  for (const [k, verdict] of verdicts) {
    const [tmdbId, kind] = k.split(":");
    const n = name(Number(tmdbId), kind as MediaKind);
    if (!n) continue;
    if (verdict === "watchlist") out.push({ name: n, kind: "watchlist" });
    else if (verdict === "love") out.push({ name: n, kind: "love" });
    else if (verdict === "like") out.push({ name: n, kind: "like" });
    else if (verdict === "dislike" || verdict === "hidden") out.push({ name: n, kind: "avoid" });
  }
  for (const p of followedPeople(userId)) out.push({ name: p.name, kind: "person" });
  for (const p of tasteFor(userId)?.strongest("person", 3, 25) ?? []) out.push({ name: p.value, kind: "taste" });
  return out;
}

// ------------------------------------------------------------------ updates

export type Update = {
  kind: "premiere" | "arrival" | "person";
  tmdbId: number;
  mediaKind: MediaKind;
  title: string;
  image: string | null;
  /** One line, the whole point: "Season 3 starts Sunday on Apple TV". */
  text: string;
  date: string;
};

/** News made from mox's own data: premieres, arrivals, new work from people you follow. */
async function updatesFor(userId: number, today = todayISO()): Promise<Update[]> {
  const out: Update[] = [];

  // Season premieres of shows you follow, from three days ago to a month ahead.
  const follows = followsFor(userId);
  if (follows.size) {
    const premieres = db
      .select()
      .from(schema.episodes)
      .where(and(
        inArray(schema.episodes.tmdbId, [...follows]),
        eq(schema.episodes.episode, 1),
        gte(schema.episodes.airs, addDaysISO(today, -3)),
        lte(schema.episodes.airs, addDaysISO(today, 30)),
      ))
      .all();
    const titles = titlesByIds(premieres.map((p) => ({ tmdbId: p.tmdbId!, kind: "tv" as MediaKind })));
    for (const p of premieres) {
      const t = titles.get(`${p.tmdbId}:tv`);
      const when = p.airs <= today ? (p.airs === today ? "starts today" : "has started") : `starts ${p.airs}`;
      out.push({
        kind: "premiere",
        tmdbId: p.tmdbId!,
        mediaKind: "tv",
        title: t?.title ?? p.show,
        image: t?.backdrop ?? t?.poster ?? null,
        text: `Season ${p.season} ${when}`,
        date: p.airs,
      });
    }
  }

  // Watchlist titles that reached one of your services in the last fortnight.
  const wanted = library(userId).watchlist;
  if (wanted.length) {
    const since = Math.floor(Date.now() / 1000) - 14 * 86400;
    const arrivals = db
      .select()
      .from(schema.availability)
      .where(and(
        inArray(schema.availability.tmdbId, wanted.map((w) => w.tmdbId)),
        gt(schema.availability.firstSeen, since),
      ))
      .orderBy(desc(schema.availability.firstSeen))
      .all();
    for (const a of arrivals) {
      const card = wanted.find((w) => w.tmdbId === a.tmdbId && w.kind === a.kind);
      // Only a service you pay for: the card's platforms are already narrowed to yours.
      if (!card || !card.platforms.some((p) => p.name === a.provider)) continue;
      if (out.some((u) => u.kind === "arrival" && u.tmdbId === a.tmdbId)) continue;
      out.push({
        kind: "arrival",
        tmdbId: a.tmdbId,
        mediaKind: a.kind,
        title: card.title,
        image: card.poster,
        text: `Now on ${a.provider} — it's on your watchlist`,
        date: todayISO(new Date(a.firstSeen * 1000)),
      });
    }
  }

  // New work from people you follow. It asks TMDB, so it gets a time limit.
  for (const n of await within(2500, newFromPeople(userId, today), [])) {
    out.push({
      kind: "person",
      tmdbId: n.title.tmdbId,
      mediaKind: n.title.kind,
      title: n.title.title,
      image: n.title.poster,
      text: `New from ${n.person.name}`,
      date: n.title.date ?? today,
    });
  }

  return out.sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(today)) - Math.abs(Date.parse(b.date) - Date.parse(today)));
}

// ------------------------------------------------------------------ board

export type Story = {
  url: string;
  source: string;
  lang: NewsLang;
  title: string;
  summary: string | null;
  image: string | null;
  publishedAt: number;
  reasons: string[];
};

const PER_SOURCE = 8;

export async function newsBoard(userId: number | null, langs: NewsLang[]) {
  await ensureFresh();
  const now = Math.floor(Date.now() / 1000);
  const rows = db
    .select()
    .from(schema.newsItems)
    .where(and(inArray(schema.newsItems.lang, langs), gt(schema.newsItems.publishedAt, now - 4 * 86400)))
    .orderBy(desc(schema.newsItems.publishedAt))
    .all();

  const matchers = userId === null ? [] : buildMatchers(interestsOf(userId));
  const sourceName = new Map(SOURCES.map((s) => [s.id, s.name]));

  const forYou: { story: Story; score: number }[] = [];
  const headlines: Story[] = [];
  const perSource = new Map<string, number>();

  for (const row of rows) {
    const categories = (() => { try { return JSON.parse(row.categories ?? "[]") as string[]; } catch { return []; } })();
    // Checked again as it is read, so a tightened rule clears what is already stored.
    if (!onTopic(row, row.lang)) continue;
    const scored = scoreItem({ title: row.title, summary: row.summary, categories }, matchers);
    if (scored.avoid) continue;
    const story: Story = {
      url: row.url,
      source: sourceName.get(row.source) ?? row.source,
      lang: row.lang,
      title: row.title,
      summary: row.summary,
      image: thumbnail(row.image),
      publishedAt: row.publishedAt,
      reasons: scored.reasons,
    };
    if (scored.score >= 2 && (scored.strong || !isList(row))) {
      forYou.push({ story, score: scored.score });
      continue;
    }
    // The rest: the last two days, a fair share from each newsroom, trailers and dates first.
    if (row.publishedAt < now - 2 * 86400) continue;
    const n = perSource.get(row.source) ?? 0;
    if (n >= PER_SOURCE) continue;
    perSource.set(row.source, n + 1);
    headlines.push(story);
  }

  // Closer to you first, and among equals the newer; a day's age costs one point.
  const rank = (s: { story: Story; score: number }) => s.score - (now - s.story.publishedAt) / 86400;
  forYou.sort((a, b) => rank(b) - rank(a));
  headlines.sort((a, b) =>
    Number(isList(a)) - Number(isList(b)) ||
    Number(isSoon(b)) - Number(isSoon(a)) ||
    b.publishedAt - a.publishedAt);

  return {
    updates: userId === null ? [] : await updatesFor(userId),
    forYou: forYou.slice(0, 20).map((s) => s.story),
    headlines: headlines.slice(0, 40),
    langs,
  };
}
