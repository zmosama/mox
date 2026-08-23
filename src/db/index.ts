import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const file = process.env.MOX_DB ?? "./data/mox.db";

/* better-sqlite3 will create the database file but not the directory holding
   it, and `data/` is ignored — so a fresh clone threw "Cannot open database
   because the directory does not exist" on the first import of this module,
   before anything had a chance to explain itself. */
mkdirSync(dirname(file), { recursive: true });

const sqlite = new Database(file);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
export type DB = typeof db;
