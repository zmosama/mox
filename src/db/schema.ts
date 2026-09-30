import { sql } from "drizzle-orm";
import {
  index, integer, primaryKey, real, sqliteTable, text, uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** A film or a series. TMDB reuses ids across the two, so `kind` is never optional. */
export const MEDIA_KINDS = ["movie", "tv"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * What you said about a title.
 *  love/like/dislike — watched, and an opinion
 *  watchlist         — not watched, but intended
 *  seen              — watched, no opinion; only means "stop offering me this"
 *  hidden            — not watched and not wanted; hidden everywhere but search
 */
export const VERDICTS = ["love", "like", "dislike", "watchlist", "seen", "hidden"] as const;
export type Verdict = (typeof VERDICTS)[number];

/**
 * Everyone who can sign in. The public site renders for nobody in particular;
 * signing in swaps in that account's verdicts, follows and taste.
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  /** scrypt, salted per user. A plaintext password is never stored or logged. */
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  /**
   * Admins reach the backend. Only the owner can grant this — an admin cannot
   * promote anyone, so one compromised account can never widen into more.
   */
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  /**
   * The one account that owns the install. Always an admin, cannot be demoted
   * or deleted by anyone including itself, and is alone in being able to change
   * anybody's role. There is exactly one, enforced by a partial unique index.
   */
  isOwner: integer("is_owner", { mode: "boolean" }).notNull().default(false),
  /**
   * When the profile photo was last set (unix seconds), or null for none. The
   * photo itself is a file under data/avatars/; this is its cache-busting
   * version, so a new photo shows at once everywhere.
   */
  avatarAt: integer("avatar_at"),
  /**
   * Preferences that follow the account between the website and the app: which
   * tabs sit in the glass bar and in what order, which languages the news
   * comes in, whether race results wait until you have watched. JSON, read
   * through `readPrefs`, which fills in anything missing — so a new preference
   * needs no migration and an old row is never wrong, only incomplete.
   */
  prefs: text("prefs"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
}, (t) => [
  // "Exactly one owner" is a database rule, not a convention someone has to
  // remember: a second row with is_owner = 1 is rejected outright.
  uniqueIndex("users_single_owner").on(t.isOwner).where(sql`${t.isOwner} = 1`),
]);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

export const titles = sqliteTable(
  "titles",
  {
    tmdbId: integer("tmdb_id").notNull(),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    releaseDate: text("release_date"),
    poster: text("poster"),
    backdrop: text("backdrop"),
    overview: text("overview"),
    rating: real("rating"),
    votes: integer("votes"),
    lang: text("lang"),
    runtime: integer("runtime"),
    collection: text("collection"),
    /**
     * The age level (see src/lib/ratings.ts): "all", "7", "pg", "13" or "18",
     * null when TMDB has no certificate for it. `ageCheckedAt` says whether
     * that null means "unrated" or "not looked up yet".
     */
    ageLevel: text("age_level"),
    ageCheckedAt: integer("age_checked_at"),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.tmdbId, t.kind] }),
    index("titles_kind_year").on(t.kind, t.year),
  ],
);

/** One row per decision. Replacing a verdict overwrites; clearing deletes. */
export const verdicts = sqliteTable(
  "verdicts",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    verdict: text("verdict", { enum: VERDICTS }).notNull(),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tmdbId, t.kind] }),
    index("verdicts_user_v").on(t.userId, t.verdict),
  ],
);

/**
 * Series you are actively watching. Deliberately not a verdict: "I loved this
 * film in 2015" and "I watch this show weekly" are different questions, and
 * folding them together is what filled the calendar with the wrong shows.
 */
export const follows = sqliteTable(
  "follows",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    addedAt: integer("added_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tmdbId] })],
);

/**
 * Actors and directors you follow. Their new work turns up on Home when it
 * reaches a service you have. Name and photo are kept with the follow, so the
 * list draws without asking TMDB for every face.
 */
export const followedPeople = sqliteTable(
  "followed_people",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull(),
    name: text("name").notNull(),
    profile: text("profile"),
    addedAt: integer("added_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.personId] })],
);

/**
 * Episodes you have watched, one row each.
 *
 * No service reports this, so it is only ever what you ticked. It exists for one
 * question: of the episodes that just landed, which have you not seen yet.
 */
export const watchedEpisodes = sqliteTable(
  "watched_episodes",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    season: integer("season").notNull(),
    episode: integer("episode").notNull(),
    watchedAt: integer("watched_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tmdbId, t.season, t.episode] })],
);

/** Keywords, cast, crew, studio — what actually separates two action films. */
export const FEATURE_KINDS = ["genre", "keyword", "person", "collection", "company", "lang", "decade"] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

export const features = sqliteTable(
  "features",
  {
    tmdbId: integer("tmdb_id").notNull(),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    feature: text("feature", { enum: FEATURE_KINDS }).notNull(),
    value: text("value").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tmdbId, t.kind, t.feature, t.value] }),
    index("features_lookup").on(t.feature, t.value),
  ],
);

/** "People who watched X also watched Y", straight from TMDB recommendations. */
export const similars = sqliteTable(
  "similars",
  {
    sourceId: integer("source_id").notNull(),
    sourceKind: text("source_kind", { enum: MEDIA_KINDS }).notNull(),
    targetId: integer("target_id").notNull(),
    targetTitle: text("target_title").notNull(),
    rank: integer("rank").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceId, t.sourceKind, t.targetId] }),
    index("similars_target").on(t.targetId),
  ],
);

/** The TV calendar, scraped per day. */
export const episodes = sqliteTable(
  "episodes",
  {
    show: text("show").notNull(),
    season: integer("season").notNull(),
    episode: integer("episode").notNull(),
    airs: text("airs").notNull(),
    tmdbId: integer("tmdb_id"),
    /**
     * The instant it lands (unix seconds), when TVmaze published a real air
     * time for it; null when only the day is known. Notifications use it to go
     * off when an episode actually arrives.
     */
    airsAt: integer("airs_at"),
  },
  (t) => [
    primaryKey({ columns: [t.show, t.season, t.episode] }),
    index("episodes_airs").on(t.airs),
  ],
);

/** Where a title streams, per region. `mine` is retained only for legacy imports. */
export const availability = sqliteTable(
  "availability",
  {
    tmdbId: integer("tmdb_id").notNull(),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    provider: text("provider").notNull(),
    region: text("region").notNull(),
    /** @deprecated Use `userServices`; application reads no longer consult this. */
    mine: integer("mine", { mode: "boolean" }).notNull().default(false),
    deepLink: text("deep_link"),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
    /**
     * When this title first turned up on this provider (unix seconds), kept
     * across refreshes the way `deepLink` is. Zero for rows older than the
     * column: when they arrived is unknown, and claiming "today" for all of
     * them would announce the whole catalogue as news.
     */
    firstSeen: integer("first_seen").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.tmdbId, t.kind, t.provider, t.region] }),
    index("availability_mine").on(t.mine),
  ],
);

/** Hand corrections: a title search that resolves to the wrong TMDB entry. */
export const overrides = sqliteTable("overrides", {
  key: text("key").primaryKey(),
  tmdbId: integer("tmdb_id"),
  kind: text("kind", { enum: MEDIA_KINDS }).notNull().default("tv"),
  note: text("note"),
});

/** Titles already surfaced, so a recommendation doesn't repeat for a while. */
export const surfaced = sqliteTable(
  "surfaced",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    shownOn: text("shown_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tmdbId] })],
);

/** Franchise universes (MCU, DCEU…) and their membership. */
/**
 * A universe is defined by what it is made of, not by a hand-kept list: a TMDB
 * keyword ("marvel cinematic universe"), a production company, or a collection.
 * Membership is rebuilt from whichever of these is set, so a film announced
 * next month joins on its own.
 */
export const universes = sqliteTable("universes", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  keyword: integer("keyword"),
  company: integer("company"),
  /** A TMDB collection, for a series that is a fixed set of films (Bond). */
  collection: integer("collection"),
});

export const universeTitles = sqliteTable(
  "universe_titles",
  {
    slug: text("slug").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.slug, t.tmdbId, t.kind] })],
);

/** Feeds a job builds: new / upcoming / trending. */
export const FEEDS = ["new", "upcoming", "trending"] as const;
export type Feed = (typeof FEEDS)[number];

export const feedItems = sqliteTable(
  "feed_items",
  {
    feed: text("feed", { enum: FEEDS }).notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    position: integer("position").notNull(),
    builtAt: text("built_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.feed, t.tmdbId, t.kind] }),
    index("feed_pos").on(t.feed, t.position),
  ],
);

/** Streaming services you subscribe to. */
/**
 * Every streaming service we know about — the catalogue people pick from, not
 * the ones anybody subscribes to. That is `userServices`.
 */
export const services = sqliteTable("services", {
  providerId: integer("provider_id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  logo: text("logo"),
  /** Services not sold locally (Disney+ in Egypt) are read from these regions. */
  regions: text("regions", { mode: "json" }).$type<string[]>(),
  /** TMDB's own ordering for the region — the useful ones come first. */
  priority: integer("priority").notNull().default(999),
});

/**
 * What one person subscribes to.
 *
 * This used to be a single `mine` flag on each availability row, decided once
 * at import time — so "on your services" meant one particular person's
 * services for everybody who visited. A row here is one account saying "I pay
 * for this".
 */
export const userServices = sqliteTable(
  "user_services",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => services.providerId, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.providerId] })],
);

/**
 * What each store has, so "new to buy" can mean added and not released.
 *
 * A film reaches a digital store three or four months after cinemas: Apple's
 * Egyptian store had 6,265 films, 168 of them released within the year and not
 * one within the month. A release-date feed of it would have been permanently
 * empty, which is the wrong answer to "has anything new turned up to rent
 * tonight". So the store's contents are recorded and compared instead, and
 * `firstSeen` is the day a title appeared in it.
 *
 * Only ids are kept. Six thousand full titles would be an enormous nightly
 * fetch for a question answered by set difference; the handful that turn out to
 * be new get fetched properly afterwards.
 */
export const storeItems = sqliteTable(
  "store_items",
  {
    providerId: integer("provider_id").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    /** Cairo date. The first sweep of a store backdates everything it finds:
        a baseline is not an arrival, and 6,265 of them is not a feed. */
    firstSeen: text("first_seen").notNull(),
    /**
     * What a film costs, which is the fact that decides whether to buy it and
     * the one TMDB has never carried. Read from JustWatch, in cents, cheapest
     * of whatever qualities are offered. Null means not looked up rather than
     * free — the card simply says nothing in that case.
     */
    jwSlug: text("jw_slug"),
    rentCent: integer("rent_cent"),
    buyCent: integer("buy_cent"),
    currency: text("currency"),
    /** Cairo date the price was read, so it can go stale and be re-read. */
    pricedAt: text("priced_at"),
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.tmdbId, t.kind] }),
    index("store_items_first_seen").on(t.firstSeen),
  ],
);

/**
 * Formula 1 races you have watched, so their results can stop being hidden.
 *
 * A race is often watched hours later, recorded, and every results screen in
 * the world opens with who won. Until a race is here its result, and the
 * standings it changed, stay covered.
 */
export const f1Watched = sqliteTable(
  "f1_watched",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    round: integer("round").notNull(),
    watchedAt: integer("watched_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.season, t.round] })],
);

/**
 * Headlines from the film and TV press, in English and Arabic.
 *
 * Only what a feed publishes openly is kept — headline, the feed's own
 * summary, its picture and the link — and the page sends you to the article
 * rather than reproducing it.
 */
export const newsItems = sqliteTable(
  "news_items",
  {
    url: text("url").primaryKey(),
    source: text("source").notNull(),
    lang: text("lang", { enum: ["en", "ar"] }).notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    image: text("image"),
    /** The feed's own categories, JSON — Variety files a story under the show's name. */
    categories: text("categories"),
    publishedAt: integer("published_at").notNull(),
    fetchedAt: integer("fetched_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [index("news_published").on(t.publishedAt)],
);

/**
 * Where one season of a series streams, when that differs from the show.
 *
 * TMDB's show-level listing is one answer for every season: MobLand reads
 * "Netflix" here because its first season is on Netflix, while the second —
 * the one with new episodes — is on TOD. Episodes take their service from
 * their season's row when there is one, and from the show otherwise.
 *
 * `services` is a JSON list of catalogue names, never empty: TMDB's season
 * listings lag the show's, so only a season that positively names a service
 * is recorded, and every other season falls back to the show.
 */
export const seasonServices = sqliteTable(
  "season_services",
  {
    tmdbId: integer("tmdb_id").notNull(),
    season: integer("season").notNull(),
    services: text("services").notNull(),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.tmdbId, t.season] })],
);

/**
 * Browsers that asked for notifications: one row per browser, per account.
 * The endpoint is the push service's address for that browser; the two keys
 * encrypt what is sent to it. A row the push service says is gone (404/410)
 * is deleted on the spot.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [index("push_user").on(t.userId)],
);

/**
 * What has already been announced to an account, so a notification goes out
 * once however often the sender runs: "ep:247718:2026-10-02", "f1:16:race".
 */
export const pushSent = sqliteTable(
  "push_sent",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    sentAt: integer("sent_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
