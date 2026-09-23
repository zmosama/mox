/**
 * Profile photos, one file per account under data/avatars/.
 *
 * Kept beside the database rather than in it, and inside data/ so a deploy —
 * which never touches data/ — never loses them. The browser and the app shrink
 * a photo to a small square before sending it, so the server only has to check
 * that what arrived really is an image and not too big.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const DIR = join(dirname(process.env.MOX_DB ?? "./data/mox.db"), "avatars");
export const MAX_AVATAR_BYTES = 1024 * 1024;

const fileFor = (userId: number) => join(DIR, String(userId));

/** The image type, read from the bytes themselves rather than trusted from a header. */
export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function saveAvatar(userId: number, bytes: Uint8Array): Promise<{ ok: true; at: number } | { ok: false; error: string }> {
  if (!bytes.length) return { ok: false, error: "No photo was sent." };
  if (bytes.length > MAX_AVATAR_BYTES) return { ok: false, error: "That photo is too large." };
  if (!sniffImage(bytes)) return { ok: false, error: "That isn't a JPEG, PNG or WebP image." };

  await mkdir(DIR, { recursive: true });
  const tmp = `${fileFor(userId)}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, fileFor(userId));

  const at = Math.floor(Date.now() / 1000);
  db.update(schema.users).set({ avatarAt: at }).where(eq(schema.users.id, userId)).run();
  return { ok: true, at };
}

export async function removeAvatar(userId: number) {
  await rm(fileFor(userId), { force: true });
  db.update(schema.users).set({ avatarAt: null }).where(eq(schema.users.id, userId)).run();
}

export async function readAvatar(userId: number): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const bytes = new Uint8Array(await readFile(fileFor(userId)));
    const type = sniffImage(bytes);
    return type ? { bytes, type } : null;
  } catch {
    return null;
  }
}
