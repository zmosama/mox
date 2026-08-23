/** Confirms the owner account exists, its password verifies, and its data is attached. */
import Database from "better-sqlite3";
import { verifyPassword } from "../src/lib/hash.js";

const password = process.argv[2];
if (!password) {
  console.error("usage: MOX_OWNER=<username> npx tsx scripts/check-owner.mts <password>");
  process.exit(1);
}

const owner = process.env.MOX_OWNER;
if (!owner) {
  console.error("set MOX_OWNER to the account to check");
  process.exit(1);
}

const db = new Database(process.env.MOX_DB ?? "data/mox.db", { readonly: true });
const user = db
  .prepare("SELECT * FROM users WHERE username = ?")
  .get(owner) as
  | { id: number; username: string; password_hash: string; is_admin: number }
  | undefined;

if (!user) {
  console.error("no owner account found");
  process.exit(1);
}

const counts = (table: string) =>
  (db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE user_id = ?`).get(user.id) as { c: number }).c;

console.log(`  user            ${user.username}  (admin: ${Boolean(user.is_admin)})`);
console.log(`  stored as       ${user.password_hash.slice(0, 10)}…  (salt:hash, scrypt)`);
console.log(`  right password  ${await verifyPassword(password, user.password_hash)}`);
console.log(`  wrong password  ${await verifyPassword("not-it", user.password_hash)}`);
console.log(`  verdicts        ${counts("verdicts")}`);
console.log(`  follows         ${counts("follows")}`);
