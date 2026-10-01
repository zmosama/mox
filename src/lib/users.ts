/**
 * Accounts, and who is allowed to change them.
 *
 * Two rules hold the whole thing up:
 *
 *   1. Signing up never grants anything. A new account is a plain user — no
 *      admin, no owner — whatever the request body says.
 *   2. Only the owner changes roles. An admin cannot promote anyone, so a
 *      single stolen admin account can never widen into a second one.
 *
 * The owner is the account that owns the install. It is always an admin, and
 * nobody — including the owner — can demote or delete it, so the install can
 * never be left with no one who can administer it.
 */
import { randomBytes } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword, verifyPassword } from "./hash";
import type { SessionUser } from "./auth";

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const MIN_PASSWORD = 8;

export type ManagedUser = {
  id: number;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  email: string | null;
  google: boolean;
  createdAt: number;
  rated: number;
  follows: number;
};

/** Everyone, with enough context to decide what to do about them. */
export function listUsers(): ManagedUser[] {
  return db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      isAdmin: schema.users.isAdmin,
      isOwner: schema.users.isOwner,
      email: schema.users.email,
      google: sql<boolean>`${schema.users.googleSub} is not null`.mapWith(Boolean),
      createdAt: schema.users.createdAt,
      rated: sql<number>`(
        select count(*) from ${schema.verdicts}
        where ${schema.verdicts.userId} = ${schema.users.id}
      )`,
      follows: sql<number>`(
        select count(*) from ${schema.follows}
        where ${schema.follows.userId} = ${schema.users.id}
      )`,
    })
    .from(schema.users)
    .orderBy(schema.users.id)
    .all();
}

export type Failure = { ok: false; error: string; status: number };
export type Success<T> = { ok: true; value: T };

const fail = (error: string, status = 400): Failure => ({ ok: false, error, status });

/**
 * Register an account.
 *
 * Deliberately takes no role argument: there is no code path from the sign-up
 * form to an elevated account, whatever a caller passes.
 */
export async function createUser(
  username: string,
  password: string,
  displayName?: string | null,
  email?: string | null,
): Promise<Success<{ id: number; username: string }> | Failure> {
  const name = username.trim().toLowerCase();
  const address = email?.trim() ? normaliseEmail(email) : null;
  if (address && !EMAIL_RE.test(address)) return fail("That does not look like an email address.");
  if (address && emailTaken(address)) return fail("Another account already uses that email.", 409);

  if (!USERNAME_RE.test(name)) {
    return fail(
      "Username must be 3–32 characters: letters, digits, dot, dash or underscore.",
    );
  }
  if (password.length < MIN_PASSWORD) {
    return fail(`Password must be at least ${MIN_PASSWORD} characters.`);
  }

  const taken = db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.username, name)).get();
  if (taken) return fail("That username is taken.", 409);

  const row = db
    .insert(schema.users)
    .values({
      username: name,
      passwordHash: await hashPassword(password),
      displayName: displayName?.trim() || null,
      email: address,
      isAdmin: false,
      isOwner: false,
    })
    .returning({ id: schema.users.id, username: schema.users.username })
    .get();

  return { ok: true, value: row };
}

/**
 * Change a name, a handle, or a password. Owner only.
 *
 * Distinct from setAdmin on purpose: editing a profile is not a role change,
 * so the owner may edit their own — what the owner may never do is stop being
 * the owner. An omitted field is left alone; a blank password means "keep it".
 */
export async function updateUser(
  actor: SessionUser,
  targetId: number,
  changes: { username?: string; displayName?: string | null; password?: string; email?: string | null },
): Promise<Success<null> | Failure> {
  const denied = requireOwner(actor);
  if (denied) return denied;

  const target = db.select().from(schema.users).where(eq(schema.users.id, targetId)).get();
  if (!target) return fail("No such user.", 404);

  const patch: Partial<typeof schema.users.$inferInsert> = {};

  if (changes.username !== undefined) {
    const name = changes.username.trim().toLowerCase();
    if (!USERNAME_RE.test(name)) {
      return fail("Username must be 3–32 characters: letters, digits, dot, dash or underscore.");
    }
    if (name !== target.username) {
      const clash = db.select({ id: schema.users.id }).from(schema.users)
        .where(eq(schema.users.username, name)).get();
      if (clash) return fail("That username is taken.", 409);
      patch.username = name;
    }
  }

  if (changes.displayName !== undefined) {
    patch.displayName = changes.displayName?.trim() || null;
  }

  /* The owner may fill in anybody's email, which is how an account made with
     a password before Google sign-in existed gets found by Google later. A
     blank clears it. */
  if (changes.email !== undefined) {
    const next = changes.email?.trim() ? normaliseEmail(changes.email) : null;
    if (next && !EMAIL_RE.test(next)) return fail("That does not look like an email address.");
    if (next && emailTaken(next, targetId)) return fail("Another account already uses that email.", 409);
    if (next !== target.email) patch.email = next;
  }

  if (changes.password) {
    if (changes.password.length < MIN_PASSWORD) {
      return fail(`Password must be at least ${MIN_PASSWORD} characters.`);
    }
    patch.passwordHash = await hashPassword(changes.password);
  }

  if (Object.keys(patch).length === 0) return { ok: true, value: null };

  db.update(schema.users).set(patch).where(eq(schema.users.id, targetId)).run();

  /* A password reset invalidates every existing session, including the
     owner's. Keeping the current session would require its id here; keeping all
     owner sessions left a stolen session valid after a password change. */
  if (patch.passwordHash) {
    db.delete(schema.sessions).where(eq(schema.sessions.userId, targetId)).run();
  }

  return { ok: true, value: null };
}

/** Grant or revoke admin. Owner only, and never against the owner. */
export function setAdmin(
  actor: SessionUser,
  targetId: number,
  isAdmin: boolean,
): Success<null> | Failure {
  const owner = requireOwner(actor);
  if (owner) return owner;

  const target = db.select().from(schema.users).where(eq(schema.users.id, targetId)).get();
  if (!target) return fail("No such user.", 404);
  if (target.isOwner) return fail("The owner is always an admin.", 409);

  db.update(schema.users).set({ isAdmin }).where(eq(schema.users.id, targetId)).run();
  return { ok: true, value: null };
}

/**
 * Delete an account and everything it holds — verdicts, follows and sessions
 * all cascade. Owner only, and the owner row itself is not deletable.
 */
export function deleteUser(actor: SessionUser, targetId: number): Success<null> | Failure {
  const owner = requireOwner(actor);
  if (owner) return owner;

  const target = db.select().from(schema.users).where(eq(schema.users.id, targetId)).get();
  if (!target) return fail("No such user.", 404);
  if (target.isOwner) return fail("The owner account cannot be deleted.", 409);

  db.delete(schema.users).where(eq(schema.users.id, targetId)).run();
  return { ok: true, value: null };
}

/** Sign every other session of a user out — useful after handing out a role. */
export function revokeSessions(actor: SessionUser, targetId: number): Success<null> | Failure {
  const owner = requireOwner(actor);
  if (owner) return owner;
  db.delete(schema.sessions).where(eq(schema.sessions.userId, targetId)).run();
  return { ok: true, value: null };
}

function requireOwner(actor: SessionUser): Failure | null {
  // Read the flag from the database rather than trusting the session payload.
  const row = db
    .select({ isOwner: schema.users.isOwner })
    .from(schema.users)
    .where(eq(schema.users.id, actor.id))
    .get();
  if (!row?.isOwner) return fail("Only the owner can change roles.", 403);
  return null;
}

/** True when somebody other than the owner exists — used to explain an empty page. */
export const hasOtherUsers = () =>
  Boolean(
    db.select({ id: schema.users.id }).from(schema.users)
      .where(ne(schema.users.isOwner, true)).get(),
  );

// ---------------------------------------------------------------- your own account

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normaliseEmail = (e: string) => e.trim().toLowerCase();

/** Somebody else already has this address. Checked before any write. */
function emailTaken(email: string, exceptUserId?: number) {
  const row = db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.email, email)).get();
  return row !== undefined && row.id !== exceptUserId;
}

/** Your own details, for the account screen. Never the hash. */
export function accountOf(userId: number) {
  const u = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!u) return null;
  return {
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    hasPassword: u.passwordSet,
    google: u.googleSub !== null,
    isOwner: u.isOwner,
  };
}

/**
 * Asks for the current password before anything sensitive changes, unless the
 * account has never had one — an account made by Google sign-in carries a random
 * hash nobody knows, and asking for it would lock its owner out.
 */
async function confirmPassword(userId: number, current: string | undefined): Promise<Failure | null> {
  const u = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!u) return fail("No such account.", 404);
  if (!u.passwordSet) return null;
  if (!current || !(await verifyPassword(current, u.passwordHash))) {
    return fail("Your current password is not right.", 403);
  }
  return null;
}

/**
 * Change your own password. Every other session is signed out — someone who
 * learnt the old password should not stay signed in — and `keepSession`, the
 * one making the change, stays.
 */
export async function changePassword(
  userId: number,
  current: string | undefined,
  next: string,
  keepSession: string | undefined,
): Promise<Success<null> | Failure> {
  const denied = await confirmPassword(userId, current);
  if (denied) return denied;
  if (next.length < MIN_PASSWORD) return fail(`Password must be at least ${MIN_PASSWORD} characters.`);
  const passwordHash = await hashPassword(next);

  db.transaction((tx) => {
    tx.update(schema.users)
      .set({ passwordHash, passwordSet: true })
      .where(eq(schema.users.id, userId)).run();
    tx.delete(schema.sessions)
      .where(keepSession
        ? and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, keepSession))
        : eq(schema.sessions.userId, userId))
      .run();
  });
  return { ok: true, value: null };
}

export async function changeEmail(
  userId: number,
  email: string,
  current: string | undefined,
): Promise<Success<{ email: string }> | Failure> {
  const denied = await confirmPassword(userId, current);
  if (denied) return denied;
  const next = normaliseEmail(email);
  if (!EMAIL_RE.test(next)) return fail("That does not look like an email address.");
  if (emailTaken(next, userId)) return fail("Another account already uses that email.", 409);
  db.update(schema.users).set({ email: next }).where(eq(schema.users.id, userId)).run();
  return { ok: true, value: { email: next } };
}

/**
 * Delete your own account and everything tied to it — ratings, follows,
 * watchlist, sessions, picks — through the foreign keys' cascades. The owner
 * cannot: an install with no owner has nobody able to manage it.
 */
export async function deleteOwnAccount(userId: number, current: string | undefined): Promise<Success<null> | Failure> {
  const u = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!u) return fail("No such account.", 404);
  if (u.isOwner) return fail("The owner account cannot be deleted.", 409);
  const denied = await confirmPassword(userId, current);
  if (denied) return denied;
  db.delete(schema.users).where(eq(schema.users.id, userId)).run();
  return { ok: true, value: null };
}

/**
 * Sign in with a verified Google profile.
 *
 * Three cases, in order: this Google account is already linked; an existing
 * account has the same email, and is linked now — which is how an account made
 * with a password before Google sign-in existed reaches the same ratings; or a
 * new account is made, with a username from the email and no password.
 */
export async function googleAccount(profile: {
  sub: string;
  email: string;
  name?: string | null;
}): Promise<Success<{ id: number; created: boolean }>> {
  const email = normaliseEmail(profile.email);

  const linked = db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.googleSub, profile.sub)).get();
  if (linked) return { ok: true, value: { id: linked.id, created: false } };

  const byEmail = db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.email, email)).get();
  if (byEmail) {
    db.update(schema.users).set({ googleSub: profile.sub }).where(eq(schema.users.id, byEmail.id)).run();
    return { ok: true, value: { id: byEmail.id, created: false } };
  }

  // A username from the address, made valid and unique: "mohammed.osama" -> "mohammed.osama2".
  const base = (email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[^a-z0-9]+/, "") || "user")
    .padEnd(3, "0").slice(0, 28);
  let username = base;
  for (let n = 2; db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.username, username)).get(); n++) username = `${base}${n}`;

  const row = db.insert(schema.users).values({
    username,
    // Random and never shown: there is no password, and `passwordSet` says so.
    passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
    passwordSet: false,
    displayName: profile.name?.trim() || null,
    email,
    googleSub: profile.sub,
    isAdmin: false,
    isOwner: false,
  }).returning({ id: schema.users.id }).get();
  return { ok: true, value: { id: row.id, created: true } };
}
