# The image that runs mox on the VPS.
#
# Reconstructed 2026-10-01 from the image already running there, because the
# recipe had never been written down: the container existed and nothing in the
# repository or on the server said how to make another one. Every choice below
# matches what `docker image inspect local/mox:latest` reported, so rebuilding
# produces the same thing rather than a new guess.
#
#   node 24.21 on bookworm, /app, user node, next start on 8782
#
# Two stages. The first has the compiler: better-sqlite3 builds from source
# and needs python3, make and a C++ toolchain, which the full image carries.
# The second is the slim image with only what was built — the toolchain is a
# gigabyte the running site never uses.
#
# The image was 2.9GB, and every deploy shipped all of it. A third of that was
# one line: `RUN chown -R node:node /app` after the build wrote a second copy
# of every file into a new layer. The files are now copied in already owned by
# node, and the build's own cache (.next/cache) is left behind.
FROM node:24-bookworm AS build

WORKDIR /app

# Dependencies first, so a change to the source does not reinstall them. The
# full tree rather than --omit=dev: the build needs the compiler, and the
# nightly refresh runs through tsx, which is a dev dependency.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The build loads every route once, in several processes at the same moment,
# and each opens the database. With no database yet they raced to create it
# and to switch it to WAL, and now and then one lost: "Failed to collect page
# data". An empty one, made once and already in WAL, has nothing to race for.
ENV NODE_ENV=production \
    MOX_DB=/tmp/build/mox.db
RUN mkdir -p /tmp/build \
    && node -e "const d=require('better-sqlite3')('/tmp/build/mox.db');d.pragma('journal_mode = WAL');d.close()" \
    && npm run build && rm -rf .next/cache

FROM node:24-bookworm-slim

# The weekly IMDb build (scripts/imdb/build.mts) downloads IMDb's files with
# curl, which the slim image does not carry.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The database and the TMDB cache live on a volume mounted at /data, so they
# survive the container being replaced. `src/db/index.ts` creates the directory
# if it is missing, which is what lets a fresh volume work.
ENV NODE_ENV=production \
    PORT=8782 \
    MOX_DB=/data/mox.db \
    MOX_TMDB_CACHE=/data/tmdb-cache

# Dependencies and the app as separate layers, owned by node from the start:
# a change to the source replaces the small layer, and a server that already
# has the big one downloads only the small one.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --chown=node:node . .

# The app runs as node; the nightly refresh writes to /data through the volume.
USER node

EXPOSE 8782
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "8782"]
