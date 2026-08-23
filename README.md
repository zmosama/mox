# mox

`mox` is a personal film and TV board: what airs today, what is new on your streaming services, franchise progress, search, ratings, follows, and a transparent taste model.

The application uses Next.js 16, React 19, SQLite, Drizzle ORM, TMDB, Tailwind CSS 4, and Vitest.

## Local setup

Requirements: Node.js 20+, npm, and SQLite.

```bash
npm ci
npm run db:migrate
npm run dev
```

Open <http://localhost:3000>. Pages work signed out. Sign in at `/admin/login` to rate titles, follow shows, and choose streaming subscriptions.

For a brand-new database, create the first account and run:

```bash
npx tsx scripts/ensure-owner.mts
```

That account becomes the install owner. Only the owner can change roles or delete accounts.

## Environment

Create `.env.local` in the project root. It is intentionally ignored by Git.

```dotenv
TMDB_API_KEY=your_tmdb_key
TMDB_REGION=EG
MOX_DB=./data/mox.db
MOX_TMDB_CACHE=./data/tmdb-cache
```

Optional:

- `MOX_SECURE_COOKIES=true` forces session cookies to HTTPS-only. Normally mox detects HTTPS from the request or `X-Forwarded-Proto`. Leave it off if you reach the server directly over plain HTTP.
- `MOX_OWNER` names the owner account for `scripts/check-owner.mts` and the legacy importer.
- Deploy settings live in `deploy/target.env`, not here. See below.

## Database and private data

- Drizzle migrations are in `drizzle/` and are applied with `npm run db:migrate`.
- `data/`, `backup/`, `legacy/`, `.env*`, and local assistant state are ignored because they may contain accounts, sessions, ratings, API keys, or old credentials.
- Never copy a local `data/mox.db` over a running install. The server owns its database.
- SQLite runs in WAL mode. Use `VACUUM INTO` for a consistent live backup; copying only `mox.db` can omit recent writes in `mox.db-wal`.

Migration `0003_backfill_user_services` preserves the owner's old global streaming-service choices in the per-user `user_services` table. Other accounts choose their own services under `/admin/services`.

## Quality checks

```bash
npm run check
npm run build
```

Individual commands:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build:webpack` — useful as a diagnostic fallback if Turbopack itself fails

The core taste tests are self-contained. When the private local legacy dataset exists, an additional differential suite verifies the TypeScript ranking against the historical Python output.

## Deploying

`deploy/deploy.sh` pushes this repository to a Mac you can reach over SSH and runs it there under a LaunchAgent.

Configure the target once. The file is ignored by Git, so your server details stay yours:

```bash
cp deploy/target.env.example deploy/target.env
```

Then deploy from the repository root:

```bash
./deploy/deploy.sh
```

The script:

1. creates a WAL-safe backup of the database on the server and downloads it to local `backup/mox.db`;
2. refuses to continue if that backup failed;
3. syncs code while excluding all databases, backups, legacy data, build output, and `.env.local`;
4. installs dependencies, applies migrations, ensures an owner exists, and builds on the server;
5. renders `deploy/launchd/app.plist.template` into a LaunchAgent, reloads it, and checks the local HTTP status.

The server needs its own `.env.local` with a TMDB key — the deploy deliberately never copies yours.
