/**
 * Make sure the install has exactly one owner.
 *
 *   npx tsx scripts/ensure-owner.mts
 *
 * The migration that added `is_owner` defaults it to false, so a database that
 * existed before it has admins but nobody who can hand out a role — the users
 * page would render with every control disabled and no way to fix it from the
 * app. This promotes the earliest admin, or failing that the earliest account.
 *
 * Idempotent: with an owner already present it changes nothing, so the deploy
 * can run it every time.
 */
import Database from "better-sqlite3";

const file = process.env.MOX_DB ?? "./data/mox.db";
const db = new Database(file);

const owner = db.prepare("select id, username from users where is_owner = 1").get() as
  | { id: number; username: string }
  | undefined;

if (owner) {
  console.log(`owner: ${owner.username} (#${owner.id}) — unchanged`);
  process.exit(0);
}

const candidate = db
  .prepare("select id, username from users order by is_admin desc, id asc limit 1")
  .get() as { id: number; username: string } | undefined;

if (!candidate) {
  console.log("no accounts yet — the first one to be created should be made owner");
  process.exit(0);
}

db.prepare("update users set is_owner = 1, is_admin = 1 where id = ?").run(candidate.id);
console.log(`owner: ${candidate.username} (#${candidate.id}) — promoted`);
