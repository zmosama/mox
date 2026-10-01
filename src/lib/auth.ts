/**
 * Accounts and sessions.
 *
 * The public site renders for nobody in particular — every page works signed
 * out. Signing in only swaps in that account's verdicts, follows and taste, and
 * unlocks the admin area where rating happens.
 */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyPassword } from "./hash";

export { hashPassword, verifyPassword } from "./hash";

export const SESSION_COOKIE = "mox_session";
const SESSION_DAYS = 60;

export type SessionUser = {
  id: number;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  /** Profile photo version (unix seconds), or null for none. See avatarUrl. */
  avatarAt: number | null;
};

/** Where a user's profile photo is served, versioned so a new one shows at once. */
export const avatarUrl = (user: { id: number; avatarAt: number | null }) =>
  user.avatarAt ? `/api/avatar/${user.id}?v=${user.avatarAt}` : null;

export async function createSession(userId: number): Promise<string> {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  db.delete(schema.sessions).where(lte(schema.sessions.expiresAt, Math.floor(Date.now() / 1000))).run();
  db.insert(schema.sessions).values({ id, userId, expiresAt }).run();
  return id;
}

export function destroySession(id: string) {
  db.delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const now = Math.floor(Date.now() / 1000);
  const row = db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      isAdmin: schema.users.isAdmin,
      avatarAt: schema.users.avatarAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, now)))
    .get();

  if (!row) {
    // Remove the stale row the browser just presented. Successful sign-ins also
    // perform a global expiry sweep in createSession.
    db.delete(schema.sessions)
      .where(and(eq(schema.sessions.id, id), lte(schema.sessions.expiresAt, now)))
      .run();
  }

  return row ?? null;
}

export async function signIn(username: string, password: string): Promise<SessionUser | null> {
  const user = db
    .select()
    .from(schema.users)
    // An address finds the account by email; anything else, by username.
    .where(username.includes("@")
      ? eq(schema.users.email, username.trim().toLowerCase())
      : eq(schema.users.username, username.trim().toLowerCase()))
    .get();

  // Hash even when the user is unknown, so a wrong username and a wrong
  // password take the same time to answer.
  const stored = user?.passwordHash ?? `${"0".repeat(32)}:${"0".repeat(128)}`;
  const ok = await verifyPassword(password, stored);
  if (!user || !ok) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    avatarAt: user.avatarAt,
  };
}

export function requestUsesHttps(req: Request) {
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (
    process.env.MOX_SECURE_COOKIES === "true" ||
    forwarded === "https" ||
    new URL(req.url).protocol === "https:"
  );
}

export const sessionCookie = (id: string, secure = false) => ({
  name: SESSION_COOKIE,
  value: id,
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86400,
});

export const clearedCookie = (secure = false) => ({
  name: SESSION_COOKIE,
  value: "",
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
});

/** The session view of an account, for a sign-in that did not come by password. */
export function userById(id: number): SessionUser | null {
  return db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      isAdmin: schema.users.isAdmin,
      avatarAt: schema.users.avatarAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get() ?? null;
}
