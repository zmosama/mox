/**
 * Signing an Apple TV in without typing a password on a remote.
 *
 * The TV asks for a code and shows it, as text and as a QR of /tv?code=…. The
 * owner of an account opens that on a phone that is already signed in and
 * approves. The TV, polling with a secret only it was given, then collects an
 * ordinary session — the same one the website and the phone use.
 *
 * The code is short because a person may read it off a screen; it is not the
 * credential. Approving needs a signed-in session, collecting needs the
 * secret, and both stop after ten minutes.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { db, schema } from "@/db";

/** No 0/O, 1/I/L: read across a room, typed on a phone. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
export const TV_LOGIN_SECONDS = 10 * 60;

const now = () => Math.floor(Date.now() / 1000);
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** What a person typed or scanned, as the code is stored; null if it cannot be one. */
export function normalizeCode(typed: string | null | undefined): string | null {
  const code = (typed ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

function newCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** A TV asks to be signed in: the code to show and the secret to keep. */
export function startTvLogin(): { code: string; secret: string; expiresIn: number } {
  db.delete(schema.tvLogins).where(lte(schema.tvLogins.expiresAt, now())).run();
  const secret = randomBytes(32).toString("base64url");
  for (let attempt = 0; ; attempt++) {
    const code = newCode();
    try {
      db.insert(schema.tvLogins)
        .values({ code, secretHash: hash(secret), expiresAt: now() + TV_LOGIN_SECONDS })
        .run();
      return { code, secret, expiresIn: TV_LOGIN_SECONDS };
    } catch (e) {
      // The code is already on some other TV's screen: draw again.
      if (attempt >= 5) throw e;
    }
  }
}

/** Is this code on a TV's screen right now, waiting? */
export function tvLoginWaiting(code: string): boolean {
  const row = db
    .select({ userId: schema.tvLogins.userId })
    .from(schema.tvLogins)
    .where(and(eq(schema.tvLogins.code, code), gt(schema.tvLogins.expiresAt, now())))
    .get();
  return !!row && row.userId == null;
}

/** A signed-in person says the TV showing this code is theirs. False if no TV is waiting on it. */
export function approveTvLogin(code: string, userId: number): boolean {
  if (!tvLoginWaiting(code)) return false;
  db.update(schema.tvLogins).set({ userId }).where(eq(schema.tvLogins.code, code)).run();
  return true;
}

export type TvClaim =
  | { state: "waiting" }
  | { state: "expired" }
  | { state: "approved"; userId: number };

/** The TV asks whether it has been approved. An approval is handed over once. */
export function claimTvLogin(secret: string): TvClaim {
  const row = db
    .select()
    .from(schema.tvLogins)
    .where(eq(schema.tvLogins.secretHash, hash(secret)))
    .get();
  if (!row || row.expiresAt <= now()) return { state: "expired" };
  if (row.userId == null) return { state: "waiting" };
  db.delete(schema.tvLogins).where(eq(schema.tvLogins.code, row.code)).run();
  return { state: "approved", userId: row.userId };
}
