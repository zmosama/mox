/**
 * Web notifications: the server's side.
 *
 * The keys that sign every notification (VAPID) are made the first time they
 * are needed and kept in a file beside the database, so a new install sets
 * itself up and a deploy — which never touches data/ — keeps them. Changing
 * them would silently orphan every browser that subscribed.
 *
 * `runSender` is called every few minutes from instrumentation.ts. For each
 * account with a browser subscribed it works out what is due (push-plan.ts),
 * leaves out what was already sent, and sends the rest.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import webpush from "web-push";
import { db, schema } from "@/db";
import { upcomingSessions, WATCH } from "./f1";
import { readPrefs } from "./prefs";
import { alerts, library } from "./queries";
import { arrivals, dueEpisodes, dueSessions, type Outgoing } from "./push-plan";

type Keys = { publicKey: string; privateKey: string };

let keys: Keys | null = null;

function vapid(): Keys {
  if (keys) return keys;
  const file = join(dirname(process.env.MOX_DB ?? "./data/mox.db"), "vapid.json");
  if (existsSync(file)) {
    keys = JSON.parse(readFileSync(file, "utf8")) as Keys;
  } else {
    keys = webpush.generateVAPIDKeys();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  }
  webpush.setVapidDetails(process.env.MOX_PUBLIC_URL ?? "https://mox.mosama.me", keys.publicKey, keys.privateKey);
  return keys;
}

export const publicKey = () => vapid().publicKey;

export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export function subscribe(userId: number, sub: BrowserSubscription) {
  db.insert(schema.pushSubscriptions)
    .values({ endpoint: sub.endpoint, userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    })
    .run();
}

export function unsubscribe(userId: number, endpoint: string) {
  db.delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.userId, userId), eq(schema.pushSubscriptions.endpoint, endpoint)))
    .run();
}

/** Send to every browser the account subscribed. Returns how many took it. */
export async function sendTo(userId: number, message: Omit<Outgoing, "key">): Promise<number> {
  vapid();
  const subs = db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId)).all();
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(message),
          { TTL: 6 * 3600 },
        );
        delivered++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // The browser unsubscribed or was reset: that address will never work again.
        if (status === 404 || status === 410) {
          db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, s.endpoint)).run();
        } else {
          console.warn(`push to user ${userId} failed: ${status ?? (e as Error).message}`);
        }
      }
    }),
  );
  return delivered;
}

/** Watchlist titles that reached one of the account's services in the last day. */
function recentArrivals(userId: number) {
  const wanted = library(userId).watchlist;
  if (!wanted.length) return [];
  const since = Math.floor(Date.now() / 1000) - 86400;
  const rows = db
    .select()
    .from(schema.availability)
    .where(and(inArray(schema.availability.tmdbId, wanted.map((w) => w.tmdbId)), gt(schema.availability.firstSeen, since)))
    .all();
  return rows.flatMap((r) => {
    const card = wanted.find((w) => w.tmdbId === r.tmdbId && w.kind === r.kind);
    // The card's platforms are already narrowed to the account's services.
    return card && card.platforms.some((p) => p.name === r.provider)
      ? [{ tmdbId: r.tmdbId, kind: r.kind, title: card.title, provider: r.provider }]
      : [];
  });
}

let running = false;

/** One pass: everything due, for everyone subscribed, sent once. */
export async function runSender(now = Date.now()) {
  if (running) return;
  running = true;
  try {
    const users = [...new Set(db.select({ userId: schema.pushSubscriptions.userId }).from(schema.pushSubscriptions).all().map((r) => r.userId))];
    if (!users.length) return;
    const sessions = await upcomingSessions(1, new Date(now)).catch(() => []);

    for (const userId of users) {
      const { notify } = readPrefs(userId);
      if (!notify.episodes && !notify.watchlist && !notify.f1) continue;

      const due: Outgoing[] = [];
      if (notify.episodes) due.push(...dueEpisodes(alerts(userId).episodes, notify.episodesAt, now));
      if (notify.f1) due.push(...dueSessions(sessions, notify.f1Lead, WATCH.name, now));
      if (notify.watchlist) due.push(...arrivals(recentArrivals(userId)));
      if (!due.length) continue;

      const sent = new Set(
        db.select({ key: schema.pushSent.key }).from(schema.pushSent)
          .where(and(eq(schema.pushSent.userId, userId), inArray(schema.pushSent.key, due.map((d) => d.key))))
          .all()
          .map((r) => r.key),
      );
      for (const item of due.filter((d) => !sent.has(d.key))) {
        // Recorded first: a crash mid-send costs one notification, never a repeat every five minutes.
        db.insert(schema.pushSent).values({ userId, key: item.key }).onConflictDoNothing().run();
        await sendTo(userId, { title: item.title, body: item.body, url: item.url, tag: item.tag });
      }
    }

    // A month of memory is plenty: every key names a date or a round.
    db.delete(schema.pushSent).where(lt(schema.pushSent.sentAt, Math.floor(now / 1000) - 30 * 86400)).run();
  } catch (e) {
    console.warn(`push sender: ${(e as Error).message}`);
  } finally {
    running = false;
  }
}
