/**
 * The rules behind the News tab, kept free of the network and the database so
 * each one can be tested: reading a feed, telling film and TV news from the
 * rest of a newsroom, and deciding which stories are about something you care
 * for.
 *
 * "Cares for" is read off what you already told mox — the shows you follow,
 * your watchlist, what you loved, the people you follow and the people who
 * keep turning up in what you rated well. No model is asked: a story ranks
 * because it names one of those, and the page says which.
 */

// ------------------------------------------------------------------ feeds

export type FeedItem = {
  url: string;
  title: string;
  summary: string | null;
  image: string | null;
  categories: string[];
  publishedAt: number;
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

export function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

const text = (s: string) => decode(decode(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : null;
};

const ARABIC_MONTHS: Record<string, number> = {
  يناير: 0, فبراير: 1, مارس: 2, أبريل: 3, ابريل: 3, مايو: 4, يونيو: 5,
  يوليو: 6, أغسطس: 7, اغسطس: 7, سبتمبر: 8, أكتوبر: 9, اكتوبر: 9, نوفمبر: 10, ديسمبر: 11,
};

/**
 * A feed's publication date as unix seconds, or null.
 *
 * Most feeds write RFC 822, which Date reads. Youm7 writes Arabic — "الخميس،
 * 24 سبتمبر 2026 01:00 م" — in Cairo time, with ص and م for am and pm.
 */
export function parseFeedDate(raw: string, cairoOffsetHours = 3): number | null {
  const s = raw.trim();
  const ar = s.match(/(\d{1,2})\s+(\S+)\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([صم])?/);
  if (ar && ARABIC_MONTHS[ar[2]] !== undefined) {
    let hour = Number(ar[4]) % 12;
    if (ar[6] === "م") hour += 12;
    if (!ar[6]) hour = Number(ar[4]);
    const utc = Date.UTC(Number(ar[3]), ARABIC_MONTHS[ar[2]], Number(ar[1]), hour - cairoOffsetHours, Number(ar[5]));
    return Math.floor(utc / 1000);
  }
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/** An RSS 2.0 feed's items. Tolerant: an item without a link or a title is skipped, not fatal. */
export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const title = tag(block, "title");
    const link = tag(block, "link") ?? tag(block, "guid");
    if (!title || !link) continue;
    const url = text(link);
    if (!/^https?:\/\//.test(url)) continue;

    const description = tag(block, "description") ?? tag(block, "content:encoded");
    const image =
      block.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i)?.[1] ??
      block.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i)?.[1] ??
      block.match(/<enclosure[^>]*type="image[^"]*"[^>]*url="([^"]+)"/i)?.[1] ??
      (description ? decode(description).match(/<img[^>]+src="([^"]+)"/i)?.[1] : undefined) ??
      null;

    const summary = description ? text(description).replace(/\s*\[…\]$|\s*\[\.\.\.\]$/, "…") : null;
    const published = parseFeedDate(tag(block, "pubDate") ?? tag(block, "dc:date") ?? "");
    out.push({
      url,
      title: text(title),
      summary: summary ? summary.slice(0, 400) : null,
      image: image ? decode(image) : null,
      categories: [...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((c) => text(c[1])).filter(Boolean),
      publishedAt: published ?? Math.floor(Date.now() / 1000),
    });
  }
  return out;
}

// ------------------------------------------------------------------ topic

/**
 * Whether a story is about films or series at all.
 *
 * The English trade papers are entertainment newsrooms, so they pass unless
 * the address files the story under music, theatre or the like. The Arabic
 * arts desks cover everything from weddings to hospital visits, so a story
 * there has to name the screen — a film, a series, a trailer, a box office.
 */
const OFF_TOPIC_PATHS = /\/(music|theater|theatre|stage|gaming|games|video-games|politics|podcasts?|shopping|commerce|lifestyle|style|fashion|real-estate|dirt)\//i;

/* Deliberately narrow. "مهرجان" alone let the Arab Music Festival in, "تصوير"
   takes in every photo shoot and "شاهد" is also just the verb "watched", so
   each of those only counts in the phrase that makes it about the screen. */
const SCREEN_WORDS_AR = /فيلم|أفلام|افلام|مسلسل|مسلسلات|سينما|السينما|السينمائي|إيرادات|ايرادات|شباك التذاكر|تريلر|برومو|البرومو|إعلان تشويقي|الموسم الجديد|نتفليكس|نتفلكس|منصة شاهد|شاهد VIP|دور العرض|العرض الأول|العرض الخاص|عرض خاص|الإعلان الرسمي|تصوير (?:فيلم|مسلسل|أحداث)|أوسكار|ديزني|أمازون برايم|OSN|HBO|Netflix/;

export function onTopic(item: Pick<FeedItem, "url" | "title" | "summary">, lang: "en" | "ar"): boolean {
  if (lang === "ar") return SCREEN_WORDS_AR.test(`${item.title} ${item.summary ?? ""}`);
  return !OFF_TOPIC_PATHS.test(item.url);
}

// ------------------------------------------------------------------ interest

export type InterestKind = "follow" | "watchlist" | "person" | "love" | "like" | "taste" | "avoid";

export type Interest = { name: string; kind: InterestKind };

const WEIGHT: Record<InterestKind, number> = {
  follow: 5, watchlist: 4, person: 4, love: 3, taste: 2, like: 2, avoid: 0,
};

const REASON: Record<Exclude<InterestKind, "avoid">, (name: string) => string> = {
  follow: (n) => `You follow ${n}`,
  watchlist: (n) => `${n} is on your watchlist`,
  person: (n) => `You follow ${n}`,
  love: (n) => `You loved ${n}`,
  like: (n) => `You liked ${n}`,
  taste: (n) => `${n} is in a lot of what you like`,
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A pattern that finds a name as a name, not as a word inside another.
 *
 * Titles are often ordinary words — "Silo", "Lucky", "Reacher" — and the
 * trades write lucky and silo in sentences all day. A one-word Latin title
 * therefore only counts inside quotation marks, which is how every trade
 * paper sets a title ('Silo' Season 3); anything longer is matched as the
 * exact, case-sensitive phrase. Arabic has no capitals to lean on, so an
 * Arabic name has to be at least two words, or four letters standing alone.
 */
export function namePattern(name: string, isTitle: boolean): RegExp | null {
  const clean = name.trim();
  if (clean.length < 3) return null;
  const arabic = /[؀-ۿ]/.test(clean);
  const words = clean.split(/\s+/).length;
  if (arabic) {
    if (words === 1 && clean.length < 4) return null;
    return new RegExp(`(^|[^\\u0600-\\u06FF])${escape(clean)}($|[^\\u0600-\\u06FF])`);
  }
  if (isTitle && words === 1) {
    return new RegExp(`[‘'"“]${escape(clean)}[’'"”]`);
  }
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(clean)}($|[^\\p{L}\\p{N}])`, "u");
}

export type Matcher = { interest: Interest; pattern: RegExp; lowered: string };

export function buildMatchers(interests: Interest[]): Matcher[] {
  const seen = new Set<string>();
  const out: Matcher[] = [];
  // Strongest reason first, so a name that is both followed and loved says "follow".
  for (const interest of [...interests].sort((a, b) => WEIGHT[b.kind] - WEIGHT[a.kind])) {
    const key = interest.name.toLowerCase();
    if (seen.has(key)) continue;
    const isTitle = interest.kind !== "person" && interest.kind !== "taste";
    const pattern = namePattern(interest.name, isTitle);
    if (!pattern) continue;
    seen.add(key);
    out.push({ interest, pattern, lowered: key });
  }
  return out;
}

export type Scored = {
  score: number;
  reasons: string[];
  avoid: boolean;
  /** About something you follow or want, not only something you once rated. */
  strong: boolean;
};

const STRONG: InterestKind[] = ["follow", "watchlist", "person"];

/**
 * How much a story is about what you care for, and why.
 *
 * A feed's categories count as an exact match — Variety files a story under
 * the show's own name — and so count for single-word titles without quotes.
 * A story about something you disliked or hid is flagged, and dropped unless
 * it is also about something you follow.
 */
export function scoreItem(item: Pick<FeedItem, "title" | "summary" | "categories">, matchers: Matcher[]): Scored {
  const haystack = `${item.title}\n${item.summary ?? ""}`;
  const cats = new Set(item.categories.map((c) => c.toLowerCase()));
  let score = 0;
  let avoid = false;
  let strong = false;
  const reasons: string[] = [];
  for (const m of matchers) {
    if (!m.pattern.test(haystack) && !cats.has(m.lowered)) continue;
    if (m.interest.kind === "avoid") {
      avoid = true;
      continue;
    }
    score += WEIGHT[m.interest.kind];
    strong ||= STRONG.includes(m.interest.kind);
    if (reasons.length < 2) reasons.push(REASON[m.interest.kind](m.interest.name));
  }
  return { score, reasons, avoid: avoid && !strong, strong };
}

/** Words that make a story more likely to be about something you can watch soon. */
const SOON = /\btrailer\b|\bteaser\b|first look|release date|premiere date|\brenewed\b|season \d+|sets? (a )?date|تريلر|برومو|موعد عرض|الموسم/i;

export const isSoon = (item: Pick<FeedItem, "title">) => SOON.test(item.title);

/**
 * "The 15 Best Netflix Comedies, Ranked": a list, not news. It names films
 * you loved only in passing, so however many it names it never earns a place
 * among your stories on loves and likes alone — only when it is about
 * something you follow or want — and it sits below the day's news in the
 * headlines.
 */
const LIST = /\branked\b|^\d+\s+(?:\S+\s+){0,3}(?:movies|films|shows|series|books|episodes|characters|scenes|moments|thrillers|comedies|dramas)\b|^(?:the\s+)?\d+\s+(?:best|great|greatest|most|perfect|underrated|essential)\b/i;

export const isList = (item: Pick<FeedItem, "title">) => LIST.test(item.title);

/**
 * A newsroom picture at thumbnail size. The trades hang 3000-pixel originals
 * in their feeds; their image servers resize on request, so ask for a small
 * one rather than sending a phone a photograph the width of a billboard.
 */
export function thumbnail(url: string | null, width = 480): string | null {
  if (!url || url.includes("?")) return url;
  if (/colliderimages\.com|screenrant|cbr\.com/.test(url)) return `${url}?q=70&fit=crop&w=${width}`;
  if (/\/wp-content\/uploads\//.test(url)) return `${url}?w=${width}`;
  return url;
}
