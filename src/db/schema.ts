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
export const universes = sqliteTable("universes", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  keyword: integer("keyword"),
  company: integer("company"),
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
  searchUrl: text("search_url"),
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
