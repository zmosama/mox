/**
 * What MOX can do in the app. Each tool reads or changes the owner's own data
 * and answers in short JSON — the model is billed by the word, so the app's
 * full title pages are trimmed to what helps it decide.
 *
 * Search and title lookups go through the app's own API handlers, so MOX sees
 * exactly what the screens show: the same ranking, the same services.
 */
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { MEDIA_KINDS, type MediaKind } from "@/db/schema";
import { comingSoon, forYou, newOnServices, tasteFor, titlesByIds } from "../queries";
import { sportsBoard } from "../sports-news";
import type { CardTitle } from "@/components/TitleCard";
import { addMemory, deleteMemory } from "./store";

type Card = { tmdbId: number; kind: MediaKind; title: string; year: number | null; rating?: number | null; verdict?: string | null; platforms?: { name: string }[]; overview?: string | null };
const brief = (c: Card) => ({
  id: c.tmdbId,
  kind: c.kind,
  title: c.title,
  year: c.year,
  ...(c.rating ? { tmdb: c.rating } : {}),
  ...(c.verdict ? { his: c.verdict } : {}),
  ...(c.platforms?.length ? { on: c.platforms.map((p) => p.name) } : {}),
});

/** Calls one of the app's own GET handlers, signed in as whoever is asking. */
async function appGet(handler: (req: Request, ctx: never) => Promise<Response>, path: string, ctx?: unknown) {
  const res = await handler(new Request(`http://mox.local${path}`), ctx as never);
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return res.json();
}

const Kind = z.enum(MEDIA_KINDS).describe('"movie" or "tv"');

/** A title as a poster card, from the same handler the title sheet reads. Null if it can't be found. */
async function cardFor(kind: MediaKind, id: number): Promise<CardTitle | null> {
  try {
    const { GET } = await import("@/app/api/title/[kind]/[id]/route");
    const t = (await appGet(GET, `/api/title/${kind}/${id}`, { params: Promise.resolve({ kind, id: String(id) }) })) as {
      title?: string; year?: number | null; poster?: string | null; rating?: number | null; verdict?: CardTitle["verdict"];
      platforms?: CardTitle["platforms"];
    };
    if (!t.title) return null;
    return { tmdbId: id, kind, title: t.title, year: t.year ?? null, poster: t.poster ?? null, rating: t.rating ?? null, verdict: t.verdict ?? null, platforms: t.platforms ?? [] };
  } catch {
    return null;
  }
}

/*
 * Words that show he himself asked for a change this turn. Once MOX has read
 * outside text (news, a title's story, search results) in a turn, the tools
 * that change his data act only if his own message asks for that kind of
 * change — so a sentence planted in a headline can never write to his
 * memory or his list on its own.
 */
const ASKS_MEMORY = /remember|forget|note|don'?t (like|want)|افتكر|فاكر|انس[ىي]|احفظ|سجل/i;
const ASKS_LIST = /watch ?list|my list|\bsave\b|\badd\b|ضيف|ضيفه|ضيفها|حط|قايم|ليست/i;

/**
 * `message` is what he wrote this turn (for the guard above); `onShow`
 * receives the posters MOX puts under its reply (show_titles).
 */
export function moxTools(userId: number, message: string, onShow: (cards: CardTitle[]) => void = () => {}) {
  let readOutside = false;
  const guarded = (asks: RegExp) => readOutside && !asks.test(message);
  const search = betaZodTool({
    name: "search_titles",
    description: "Search films and series by name (English or Arabic). Returns ids, years, where each streams for him, and his own rating if any.",
    inputSchema: z.object({ query: z.string().min(2).max(100) }),
    run: async ({ query }) => {
      readOutside = true;
      const { GET } = await import("@/app/api/search/route");
      const body = (await appGet(GET, `/api/search?q=${encodeURIComponent(query)}`)) as { results: Card[]; people: { name: string; role?: string }[] };
      return JSON.stringify({ titles: body.results.slice(0, 8).map(brief), people: body.people.slice(0, 3).map((p) => p.name) });
    },
  });

  const details = betaZodTool({
    name: "title_details",
    description: "One film or series in full: story, genres, cast, ratings, age, where it streams for him, his rating, whether he follows it and how far he is in it, and similar titles.",
    inputSchema: z.object({ kind: Kind, id: z.number().int().positive() }),
    run: async ({ kind, id }) => {
      readOutside = true;
      const { GET } = await import("@/app/api/title/[kind]/[id]/route");
      const t = (await appGet(GET, `/api/title/${kind}/${id}`, { params: Promise.resolve({ kind, id: String(id) }) })) as Record<string, unknown> & {
        platforms?: { name: string }[]; similar?: Card[]; progress?: { season?: number; seasonCount?: number } | null;
      };
      return JSON.stringify({
        title: t.title, year: t.year, kind, id, genres: t.genres, overview_from_tmdb: String(t.overview ?? "").slice(0, 500),
        tmdb: t.rating, imdb: t.imdb, age: t.age, runtime: t.runtime, seasons: t.seasons, cast: t.cast, directors: t.directors,
        on: t.platforms?.map((p) => p.name) ?? [], his: t.verdict, following: t.following,
        progress: t.progress ? { season: t.progress.season, of: t.progress.seasonCount } : null,
        similar: (t.similar ?? []).slice(0, 6).map(brief),
      });
    },
  });

  const ratings = betaZodTool({
    name: "my_ratings",
    description: "What he has rated, most recent first. Filter by verdict: love, like, dislike, seen, hidden, or watchlist (wants to watch).",
    inputSchema: z.object({
      verdict: z.enum(["love", "like", "dislike", "seen", "hidden", "watchlist"]).optional(),
      limit: z.number().int().min(1).max(60).default(25),
    }),
    run: async ({ verdict, limit }) => {
      const rows = db
        .select({ tmdbId: schema.verdicts.tmdbId, kind: schema.verdicts.kind, verdict: schema.verdicts.verdict })
        .from(schema.verdicts)
        .where(verdict ? and(eq(schema.verdicts.userId, userId), eq(schema.verdicts.verdict, verdict)) : eq(schema.verdicts.userId, userId))
        .orderBy(desc(schema.verdicts.updatedAt))
        .limit(limit)
        .all();
      const names = titlesByIds(rows);
      const counts = db.select({ verdict: schema.verdicts.verdict }).from(schema.verdicts).where(eq(schema.verdicts.userId, userId)).all()
        .reduce<Record<string, number>>((n, r) => ({ ...n, [r.verdict]: (n[r.verdict] ?? 0) + 1 }), {});
      return JSON.stringify({
        totals: counts,
        titles: rows.map((r) => {
          const t = names.get(`${r.tmdbId}:${r.kind}`);
          return { id: r.tmdbId, kind: r.kind, title: t?.title ?? "(not in the curated list — look it up)", year: t?.year ?? null, his: r.verdict };
        }),
      });
    },
  });

  const following = betaZodTool({
    name: "my_shows",
    description: "The series he follows, and new episodes of them out in the last week that he has not marked watched.",
    inputSchema: z.object({}),
    run: async () => {
      const followed = db.select({ tmdbId: schema.follows.tmdbId }).from(schema.follows).where(eq(schema.follows.userId, userId)).all();
      const names = titlesByIds(followed.map((f) => ({ tmdbId: f.tmdbId, kind: "tv" as MediaKind })));
      return JSON.stringify({
        following: followed.map((f) => names.get(`${f.tmdbId}:tv`)?.title ?? `tv ${f.tmdbId}`),
        new_episodes: forYou(userId).slice(0, 15).map((e) => ({ ...brief(e), episode: (e as unknown as { label?: string }).label ?? null })),
      });
    },
  });

  const taste = betaZodTool({
    name: "my_taste",
    description: "His taste model: the genres, themes and people that pull his ratings above his own average, strongest first, and the ones that pull them down.",
    inputSchema: z.object({}),
    run: async () => {
      const t = tasteFor(userId);
      if (!t) return JSON.stringify({ note: "Not enough ratings yet." });
      const pick = (kind: "genre" | "keyword" | "person" | "decade") =>
        t.strongest(kind, 3, 40).map((r) => ({ name: r.value, pull: Math.round(r.affinity * 100) / 100, rated: r.seen }));
      const top = (rows: ReturnType<typeof pick>, n: number) => ({ loves: rows.filter((r) => r.pull > 0).slice(0, n), avoids: rows.filter((r) => r.pull < 0).sort((a, b) => a.pull - b.pull).slice(0, Math.ceil(n / 2)) });
      return JSON.stringify({ genres: top(pick("genre"), 6), themes: top(pick("keyword"), 12), people: top(pick("person"), 10), decades: top(pick("decade"), 4) });
    },
  });

  const picks = betaZodTool({
    name: "my_picks",
    description: "The titles the app's taste model picked for him (his Picks), best first — a strong starting point for recommendations.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(30).default(15) }),
    run: async ({ limit }) => {
      const rows = db.select().from(schema.picks).where(eq(schema.picks.userId, userId)).orderBy(schema.picks.rank).limit(limit).all();
      const names = titlesByIds(rows.map((r) => ({ tmdbId: r.tmdbId, kind: r.kind })));
      return JSON.stringify(rows.map((r) => {
        const t = names.get(`${r.tmdbId}:${r.kind}`);
        return { id: r.tmdbId, kind: r.kind, title: t?.title ?? null, year: t?.year ?? null };
      }));
    },
  });

  const whatsNew = betaZodTool({
    name: "whats_new",
    description: "What just arrived on his streaming services, and what is coming soon.",
    inputSchema: z.object({}),
    run: async () => JSON.stringify({ just_arrived: newOnServices(userId).slice(0, 15).map(brief), coming_soon: comingSoon(userId).slice(0, 10).map(brief) }),
  });

  const f1News = betaZodTool({
    name: "f1_news",
    description: "The latest Formula 1 headlines, in Arabic, newest first.",
    inputSchema: z.object({}),
    run: async () => {
      readOutside = true;
      return JSON.stringify({
        untrusted_headlines: sportsBoard().slice(0, 12).map((s) => ({ title: s.title, summary: s.summary, source: s.source, at: new Date(s.publishedAt * 1000).toISOString() })),
      });
    },
  });

  const save = betaZodTool({
    name: "add_to_watchlist",
    description: "Put a title on his watchlist. Only when he asked for it or plainly agreed. Never replaces a rating he already gave.",
    inputSchema: z.object({ kind: Kind, id: z.number().int().positive() }),
    run: async ({ kind, id }) => {
      if (guarded(ASKS_LIST)) return JSON.stringify({ done: false, reason: "Ask him first whether to add it." });
      const had = db.select({ v: schema.verdicts.verdict }).from(schema.verdicts)
        .where(and(eq(schema.verdicts.userId, userId), eq(schema.verdicts.tmdbId, id), eq(schema.verdicts.kind, kind))).get();
      if (had) return JSON.stringify({ done: false, reason: `He already marked it "${had.v}".` });
      db.insert(schema.verdicts).values({ userId, tmdbId: id, kind, verdict: "watchlist" }).run();
      return JSON.stringify({ done: true });
    },
  });

  const remember = betaZodTool({
    name: "remember",
    description: "Save one lasting fact about him — a taste, a dislike, a habit, who he watches with. One short sentence in English, written about him in the third person.",
    inputSchema: z.object({ fact: z.string().min(3).max(300) }),
    run: async ({ fact }) => {
      // What he says about himself is worth keeping without being asked; what came from a tool result is not.
      if (guarded(ASKS_MEMORY) && !/\b(i|i'm|my|me)\b|أنا|انا|بحب|بكره|مبحبش/i.test(message)) {
        return JSON.stringify({ saved: false, reason: "Only remember what he said about himself." });
      }
      return JSON.stringify({ saved: addMemory(userId, fact, "chat") });
    },
  });

  const forget = betaZodTool({
    name: "forget",
    description: "Delete a saved memory by its number, when he says it is wrong or no longer true.",
    inputSchema: z.object({ id: z.number().int().positive() }),
    run: async ({ id }) => {
      if (guarded(ASKS_MEMORY)) return JSON.stringify({ deleted: false, reason: "Ask him first." });
      return JSON.stringify({ deleted: deleteMemory(userId, id) });
    },
  });

  const show = betaZodTool({
    name: "show_titles",
    description: "Show posters of the titles you are recommending or talking about, under your reply, so he can tap one to open it. Use it whenever your reply names specific films or series — once, with all of them, in the order you name them. Only ids you got from your other tools.",
    inputSchema: z.object({
      titles: z.array(z.object({ kind: Kind, id: z.number().int().positive() })).min(1).max(8),
    }),
    run: async ({ titles }) => {
      const seen = new Set<string>();
      const unique = titles.filter((t) => !seen.has(`${t.kind}:${t.id}`) && seen.add(`${t.kind}:${t.id}`));
      const cards = (await Promise.all(unique.map((t) => cardFor(t.kind, t.id)))).filter((c): c is CardTitle => c !== null);
      onShow(cards);
      return JSON.stringify({ shown: cards.map((c) => c.title), missing: unique.length - cards.length });
    },
  });

  return [search, details, ratings, following, taste, picks, whatsNew, f1News, save, remember, forget, show];
}

/** What the ring says while a tool runs, in the language of the screen. */
export const TOOL_STATUS: Record<string, string> = {
  search_titles: "Searching",
  title_details: "Looking it up",
  my_ratings: "Checking your ratings",
  my_shows: "Checking your shows",
  my_taste: "Thinking about your taste",
  my_picks: "Looking at your Picks",
  whats_new: "Checking what's new",
  f1_news: "Reading the F1 news",
  add_to_watchlist: "Adding it to your watchlist",
  remember: "Remembering that",
  forget: "Forgetting that",
  show_titles: "Getting the posters",
};

