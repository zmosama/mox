/**
 * Password hashing, kept apart from the session code so scripts can use it
 * without pulling in `next/headers`.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;

/** scrypt with a per-user salt, stored as `salt:hash` in hex. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LEN);
  const expected = Buffer.from(keyHex, "hex");
  // A length mismatch alone must not answer faster than a wrong password.
  return key.length === expected.length && timingSafeEqual(key, expected);
}
