/**
 * Build MOX's copy of IMDb's public datasets, imdb.db.
 *
 *   tsx scripts/imdb/build.mts --download
 *
 * IMDb publishes its catalogue as tab-separated files, refreshed daily, for
 * personal and non-commercial use (https://developer.imdb.com/non-commercial-datasets/).
 * Unpacked they are about 10GB, nearly all of it TV episodes, shorts, video
 * games and titles nobody has rated. What is kept here is what MOX can use:
 *
 *   - films and series (not episodes, shorts, videos or games) with at least
 *     MIN_VOTES votes, with their IMDb rating and vote count;
 *   - their Arabic and Egyptian titles, so a search in Arabic finds them;
 *   - the first actors, directors and writers of each, and those people.
 *
 * It runs on the server, weekly, from /etc/cron.d/apps:
 *
 *   docker exec -e IMDB_SRC=/data/imdb-src -e IMDB_DB=/data/imdb.db apps-mox-1 \
 *     nice -n 19 node_modules/.bin/tsx scripts/imdb/build.mts --download
 *
 * Everything is streamed a line at a time — a full build peaks under 400MB of
 * memory and takes a few minutes — and written under a temporary name, then
 * swapped in with one rename, so the site never reads half a database. The
 * app notices the new file within a minute (src/lib/imdb.ts).
 */
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import Database from "better-sqlite3";
import { foldArabic } from "../../src/lib/arabic";

const SRC = process.env.IMDB_SRC ?? "data/imdb-src";
const OUT = process.env.IMDB_DB ?? "data/imdb.db";
const MIN_VOTES = Number(process.env.IMDB_MIN_VOTES ?? 100);
const KEPT_TYPES = new Set(["movie", "tvSeries", "tvMiniSeries", "tvMovie"]);
const KEPT_JOBS = new Set(["actor", "actress", "director", "writer"]);
const MAX_ORDER = 15;
/** Arabic-speaking regions, for the akas worth searching by. */
const ARAB = new Set(["EG", "SA", "AE", "KW", "QA", "BH", "OM", "JO", "LB", "SY", "IQ", "MA", "DZ", "TN", "LY", "SD", "PS", "YE", "XAR"]);
const FILES = ["title.basics", "title.ratings", "title.akas", "title.principals", "name.basics"];

const t0 = Date.now();
const log = (msg: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  ${msg}`);
const nul = (v: string) => (v === "\\N" || v === "" ? null : v);
const int = (v: string) => (v === "\\N" ? null : Number(v) || null);

if (process.argv.includes("--download")) {
  mkdirSync(SRC, { recursive: true });
  for (const f of FILES) {
    log(`downloading ${f}`);
    // -z: only when IMDb has a newer file than the one already here.
    execFileSync("curl", ["-sfL", "-z", join(SRC, `${f}.tsv.gz`), "-o", join(SRC, `${f}.tsv.gz`), `https://datasets.imdbws.com/${f}.tsv.gz`]);
  }
}
for (const f of FILES) {
  if (!existsSync(join(SRC, `${f}.tsv.gz`))) throw new Error(`missing ${SRC}/${f}.tsv.gz — run with --download`);
}

/** Each row of a gzipped TSV, as its fields, header skipped. */
async function* rows(file: string): AsyncGenerator<string[]> {
  const lines = createInterface({ input: createReadStream(join(SRC, `${file}.tsv.gz`)).pipe(createGunzip()), crlfDelay: Infinity });
  let first = true;
  for await (const line of lines) {
    if (first) { first = false; continue; }
    yield line.split("\t");
  }
}

const tmp = `${OUT}.building`;
rmSync(tmp, { force: true });
const db = new Database(tmp);
db.pragma("journal_mode = OFF");
db.pragma("synchronous = OFF");
db.exec(`
  create table titles (
    tconst text primary key, type text not null, title text not null, original text,
    year integer, end_year integer, runtime integer, genres text, rating real, votes integer
  ) without rowid;
  create table akas (tconst text not null, title text not null, region text, lang text);
  create table people (nconst text primary key, name text not null, birth integer, death integer, professions text) without rowid;
  create table credits (tconst text not null, nconst text not null, category text not null, ord integer, characters text);
  create table meta (key text primary key, value text);
`);

/** Commits every 50,000 rows, so a long file is not one enormous transaction. */
function batched<A extends unknown[]>(sql: string) {
  const stmt = db.prepare(sql);
  let n = 0;
  db.exec("begin");
  return {
    add: (...args: A) => { stmt.run(...args); if (++n % 50_000 === 0) { db.exec("commit"); db.exec("begin"); } },
    done: () => { db.exec("commit"); return n; },
  };
}

// 1. Ratings: which titles have enough votes to be worth keeping.
const ratings = new Map<string, [number, number]>();
for await (const [tconst, rating, votes] of rows("title.ratings")) {
  if (Number(votes) >= MIN_VOTES) ratings.set(tconst, [Number(rating), Number(votes)]);
}
log(`ratings: ${ratings.size} titles with ${MIN_VOTES}+ votes`);

// 2. Titles: films and series among them.
const kept = new Set<string>();
{
  const insert = batched<unknown[]>("insert into titles values (?,?,?,?,?,?,?,?,?,?)");
  for await (const [tconst, type, primary, original, adult, start, end, runtime, genres] of rows("title.basics")) {
    const r = ratings.get(tconst);
    if (!r || !KEPT_TYPES.has(type) || adult === "1") continue;
    kept.add(tconst);
    insert.add(tconst, type, primary, original !== primary ? nul(original) : null, int(start), int(end), int(runtime), nul(genres), r[0], r[1]);
  }
  log(`titles: ${insert.done()} films and series`);
}
ratings.clear();

// 3. Arabic titles, so a search in Arabic finds them.
{
  const insert = batched<unknown[]>("insert into akas values (?,?,?,?)");
  for await (const [tconst, , title, region, lang] of rows("title.akas")) {
    if (!kept.has(tconst)) continue;
    if (lang !== "ar" && !ARAB.has(region)) continue;
    insert.add(tconst, title, nul(region), nul(lang));
  }
  log(`akas: ${insert.done()} Arabic and regional titles`);
}

// 4. The first actors, directors and writers of each.
const people = new Set<string>();
{
  const insert = batched<unknown[]>("insert into credits values (?,?,?,?,?)");
  for await (const [tconst, ordering, nconst, category, , characters] of rows("title.principals")) {
    if (!kept.has(tconst) || !KEPT_JOBS.has(category) || Number(ordering) > MAX_ORDER) continue;
    people.add(nconst);
    // ["Bruce Wayne","Batman"] → Bruce Wayne / Batman
    const as = nul(characters);
    insert.add(tconst, nconst, category, Number(ordering), as ? (JSON.parse(as) as string[]).join(" / ") : null);
  }
  log(`credits: ${insert.done()}`);
}

// 5. Those people.
{
  const insert = batched<unknown[]>("insert into people values (?,?,?,?,?)");
  for await (const [nconst, name, birth, death, professions] of rows("name.basics")) {
    if (people.has(nconst)) insert.add(nconst, name, int(birth), int(death), nul(professions));
  }
  log(`people: ${insert.done()}`);
}

// 6. Indexes, and a full-text index over every name a title goes by.
db.exec(`
  create index credits_title on credits (tconst, ord);
  create index credits_person on credits (nconst);
  create index akas_title on akas (tconst);
  create index titles_votes on titles (votes desc);
  create virtual table title_search using fts5 (tconst unindexed, name, tokenize = 'unicode61 remove_diacritics 2');
`);
{
  // Every name a title goes by, Arabic folded the way searches are (see arabic.ts).
  const insert = batched<unknown[]>("insert into title_search (tconst, name) values (?, ?)");
  const names = db.prepare(`
    select tconst, title as name from titles
    union select tconst, original from titles where original is not null
    union select tconst, title from akas`);
  // Read whole first: better-sqlite3 cannot write while a read is still open.
  for (const r of names.all() as { tconst: string; name: string }[]) insert.add(r.tconst, foldArabic(r.name));
  log(`search: ${insert.done()} names indexed`);
}
const sources = Object.fromEntries(FILES.map((f) => [f, statSync(join(SRC, `${f}.tsv.gz`)).mtime.toISOString()]));
db.prepare("insert into meta values (?, ?)").run("built_at", new Date().toISOString());
db.prepare("insert into meta values (?, ?)").run("min_votes", String(MIN_VOTES));
db.prepare("insert into meta values (?, ?)").run("sources", JSON.stringify(sources));
db.exec("vacuum");
db.close();
renameSync(tmp, OUT);
log(`wrote ${OUT}: ${(statSync(OUT).size / 1e6).toFixed(0)}MB`);
