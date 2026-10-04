/**
 * Preferences that follow an account between the website and the app.
 *
 * Stored as one JSON column and always read through `readPrefs`, which keeps
 * what is valid and fills in the rest. A preference added later needs no
 * migration, and a row written by an older build is never wrong, only
 * incomplete.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { AGE_LEVELS, type AgeLevel } from "./ratings";

/**
 * Every tab the glass bar can hold, besides the ring in the middle, which is
 * always there and never moves.
 *
 * `interest` marks the tabs that are a passion rather than part of MOX itself —
 * F1 today, football or anime later. Adding one is a row here and a screen;
 * the bar, the settings and the stored order already cope with it.
 * `appOnly` tabs read the phone's own calendar and reminders, which a website
 * cannot, so the website leaves them out of its bar.
 */
export const TABS = [
  { id: "today", label: "Today", interest: false, appOnly: false },
  { id: "news", label: "News", interest: false, appOnly: false },
  { id: "library", label: "My List", interest: false, appOnly: false },
  // Recommendations, built each night by the taste model. The app only, for now.
  { id: "picks", label: "Picks", interest: false, appOnly: true },
  // Disney, A24, HBO… and what each made, by popularity, rating or date.
  { id: "studios", label: "Studios", interest: false, appOnly: false },
  // What your friends on MOX rated lately.
  { id: "friends", label: "Friends", interest: false, appOnly: false },
  { id: "f1", label: "F1", interest: true, appOnly: false },
  { id: "calendar", label: "Calendar", interest: false, appOnly: true },
  { id: "tasks", label: "Tasks", interest: false, appOnly: true },
] as const;

export type TabId = (typeof TABS)[number]["id"];
const TAB_IDS = TABS.map((t) => t.id) as [TabId, ...TabId[]];

/** Two either side of the ring: more than five and iOS folds the rest into "More". */
export const TAB_SLOTS = 4;

export const DEFAULT_TABS: TabId[] = ["today", "news", "library", "f1"];

export const NEWS_LANGS = ["en", "ar"] as const;
export type NewsLang = (typeof NEWS_LANGS)[number];

export type Prefs = {
  /** Left to right, the ring sitting between the second and the third. */
  tabs: TabId[];
  newsLangs: NewsLang[];
  /** Hide race results, and the standings they moved, until you mark the race watched. */
  f1Shield: boolean;
  /** The age levels to show. All five means the filter is off. */
  ages: AgeLevel[];
  /** Also hide titles with no certificate at all — shown by default. */
  hideUnrated: boolean;
  /**
   * Web notifications, sent by the server to every browser this account turned
   * them on in. The iPhone app keeps its own switches: it schedules its
   * notifications on the phone.
   */
  notify: Notify;
};

export type Notify = {
  episodes: boolean;
  watchlist: boolean;
  f1: boolean;
  /** When episode notifications go off, minutes after midnight Cairo time. */
  episodesAt: number;
  /** Minutes before an F1 session starts. */
  f1Lead: number;
};

export const DEFAULT_NOTIFY: Notify = { episodes: false, watchlist: false, f1: false, episodesAt: 600, f1Lead: 15 };

export const DEFAULT_PREFS: Prefs = {
  tabs: DEFAULT_TABS,
  newsLangs: ["en", "ar"],
  f1Shield: true,
  ages: [...AGE_LEVELS],
  hideUnrated: false,
  notify: DEFAULT_NOTIFY,
};

/** What a client may send: any subset, each part checked on its own. */
export const PrefsPatch = z
  .object({
    tabs: z.array(z.enum(TAB_IDS)).min(1).max(TAB_SLOTS),
    newsLangs: z.array(z.enum(NEWS_LANGS)).min(1),
    f1Shield: z.boolean(),
    ages: z.array(z.enum(AGE_LEVELS)).min(1),
    hideUnrated: z.boolean(),
    notify: z.object({
      episodes: z.boolean(),
      watchlist: z.boolean(),
      f1: z.boolean(),
      episodesAt: z.number().int().min(0).max(24 * 60 - 1),
      f1Lead: z.number().int().min(1).max(180),
    }),
  })
  .partial();

/**
 * Stored JSON to preferences. Anything unreadable falls back to its default on
 * its own, so one bad field never costs the others.
 */
export function parsePrefs(raw: string | null | undefined): Prefs {
  let stored: Record<string, unknown> = {};
  try {
    const value = raw ? JSON.parse(raw) : {};
    if (value && typeof value === "object") stored = value;
  } catch {
    // Unreadable: every field takes its default below.
  }
  const field = <K extends keyof Prefs>(key: K): Prefs[K] => {
    const checked = PrefsPatch.shape[key].safeParse(stored[key]);
    return checked.success && checked.data !== undefined ? (checked.data as Prefs[K]) : DEFAULT_PREFS[key];
  };
  return {
    tabs: [...new Set(field("tabs"))],
    newsLangs: [...new Set(field("newsLangs"))],
    f1Shield: field("f1Shield"),
    ages: [...new Set(field("ages"))],
    hideUnrated: field("hideUnrated"),
    notify: field("notify"),
  };
}

export function readPrefs(userId: number | null): Prefs {
  if (userId === null) return DEFAULT_PREFS;
  const row = db.select({ prefs: schema.users.prefs }).from(schema.users).where(eq(schema.users.id, userId)).get();
  return parsePrefs(row?.prefs);
}

export function writePrefs(userId: number, patch: z.infer<typeof PrefsPatch>): Prefs {
  const next = { ...readPrefs(userId), ...patch };
  next.tabs = [...new Set(next.tabs)];
  next.newsLangs = [...new Set(next.newsLangs)];
  next.ages = [...new Set(next.ages)];
  db.update(schema.users).set({ prefs: JSON.stringify(next) }).where(eq(schema.users.id, userId)).run();
  return next;
}

/** The tabs a website can show, in the account's order. */
export const webTabs = (prefs: Prefs) =>
  prefs.tabs.filter((id) => !TABS.find((t) => t.id === id)?.appOnly);
