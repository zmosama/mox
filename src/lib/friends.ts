/**
 * Friends: people on this MOX who see each other's ratings.
 *
 * A friendship is always mutual. Adding someone by their username or email
 * writes both directions at once, and removing it from either side removes
 * both, so "they see mine" and "I see theirs" can never disagree. There is no
 * request to accept: ratings of films between people who know each other are
 * not worth a permission step.
 *
 * Every verdict counts, not only the good ones — "Sara didn't like it" is as
 * useful before pressing play as "Sara loves it".
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MediaKind, Verdict } from "@/db/schema";
import { avatarUrl } from "./auth";
import type { Failure, Success } from "./users";

export type Friend = { id: number; name: string; username: string; avatar: string | null };

/** One friend's verdict on one title, as a card shows it. */
export type FriendMark = { id: number; name: string; avatar: string | null; verdict: Verdict };

const fail = (error: string, status = 400): Failure => ({ ok: false, error, status });
const key = (tmdbId: number, kind: MediaKind) => `${tmdbId}:${kind}`;

const nameOf = (u: { displayName: string | null; username: string }) => u.displayName?.trim() || u.username;

export function friendIds(userId: number): number[] {
  return db
    .select({ id: schema.friends.friendId })
    .from(schema.friends)
    .where(eq(schema.friends.userId, userId))
    .all()
    .map((r) => r.id);
}

/** Your friends, by name. */
export function friendsOf(userId: number): Friend[] {
  return db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      avatarAt: schema.users.avatarAt,
    })
    .from(schema.friends)
    .innerJoin(schema.users, eq(schema.friends.friendId, schema.users.id))
    .where(eq(schema.friends.userId, userId))
    .all()
    .map((u) => ({ id: u.id, name: nameOf(u), username: u.username, avatar: avatarUrl(u) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Add a friend by their exact username or email. Exact on purpose: there is no
 * list of everyone on the install to browse, only people you already know.
 */
export function addFriend(userId: number, who: string): Success<Friend> | Failure {
  const handle = who.trim().toLowerCase().replace(/^@/, "");
  if (!handle) return fail("Type their username or email.");
  const them = db
    .select()
    .from(schema.users)
    .where(or(eq(schema.users.username, handle), eq(schema.users.email, handle)))
    .get();
  if (!them) return fail(`Nobody on MOX goes by “${who.trim()}”.`, 404);
  if (them.id === userId) return fail("That's you.");

  db.transaction((tx) => {
    for (const [a, b] of [[userId, them.id], [them.id, userId]]) {
      tx.insert(schema.friends).values({ userId: a, friendId: b }).onConflictDoNothing().run();
    }
  });
  return { ok: true, value: { id: them.id, name: nameOf(them), username: them.username, avatar: avatarUrl(them) } };
}

/** Unfriend, for both of you. */
export function removeFriend(userId: number, friendId: number) {
  db.delete(schema.friends)
    .where(
      or(
        and(eq(schema.friends.userId, userId), eq(schema.friends.friendId, friendId)),
        and(eq(schema.friends.userId, friendId), eq(schema.friends.friendId, userId)),
      ),
    )
    .run();
}

/** What your friends made of these titles, newest verdict first. */
export function friendMarks(userId: number | null, refs: { tmdbId: number; kind: MediaKind }[]) {
  const out = new Map<string, FriendMark[]>();
  if (userId === null || !refs.length) return out;
  const ids = friendIds(userId);
  if (!ids.length) return out;
  const wanted = new Set(refs.map((r) => key(r.tmdbId, r.kind)));

  const rows = db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      avatarAt: schema.users.avatarAt,
      tmdbId: schema.verdicts.tmdbId,
      kind: schema.verdicts.kind,
      verdict: schema.verdicts.verdict,
    })
    .from(schema.verdicts)
    .innerJoin(schema.users, eq(schema.verdicts.userId, schema.users.id))
    .where(and(inArray(schema.verdicts.userId, ids), inArray(schema.verdicts.tmdbId, [...new Set(refs.map((r) => r.tmdbId))])))
    .orderBy(desc(schema.verdicts.updatedAt))
    .all();

  for (const r of rows) {
    const k = key(r.tmdbId, r.kind);
    if (!wanted.has(k)) continue;
    const list = out.get(k) ?? [];
    list.push({ id: r.id, name: nameOf(r), avatar: avatarUrl(r), verdict: r.verdict });
    out.set(k, list);
  }
  return out;
}

export const FEED_PAGE = 20;

/**
 * What your friends rated lately, newest first — all of them, or one friend,
 * and optionally one kind of verdict. A page of rows; titles are filled in by
 * the caller.
 */
export function friendActivity(
  userId: number,
  opts: { friendId?: number; verdict?: Verdict; page: number },
) {
  const ids = friendIds(userId);
  const who = opts.friendId !== undefined ? ids.filter((id) => id === opts.friendId) : ids;
  if (!who.length) return { rows: [], more: false };

  const rows = db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      avatarAt: schema.users.avatarAt,
      tmdbId: schema.verdicts.tmdbId,
      kind: schema.verdicts.kind,
      verdict: schema.verdicts.verdict,
      at: schema.verdicts.updatedAt,
    })
    .from(schema.verdicts)
    .innerJoin(schema.users, eq(schema.verdicts.userId, schema.users.id))
    .where(
      and(
        inArray(schema.verdicts.userId, who),
        opts.verdict ? eq(schema.verdicts.verdict, opts.verdict) : undefined,
      ),
    )
    .orderBy(desc(schema.verdicts.updatedAt), desc(schema.verdicts.tmdbId))
    .limit(FEED_PAGE + 1)
    .offset((opts.page - 1) * FEED_PAGE)
    .all();

  return {
    rows: rows.slice(0, FEED_PAGE).map((r) => ({
      tmdbId: r.tmdbId,
      kind: r.kind,
      at: r.at,
      friend: { id: r.id, name: nameOf(r), avatar: avatarUrl(r), verdict: r.verdict } satisfies FriendMark,
    })),
    more: rows.length > FEED_PAGE,
  };
}
