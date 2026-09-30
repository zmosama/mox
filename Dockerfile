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
# Not `node:24-slim`: better-sqlite3 compiles from source and needs python3,
# make and a C++ toolchain, which the full image already carries.
FROM node:24-bookworm

WORKDIR /app

# Dependencies first, so a change to the source does not reinstall them. The
# full tree rather than --omit=dev: the build needs the compiler, and the
# nightly refresh runs through tsx, which is a dev dependency.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The database and the TMDB cache live on a volume mounted at /data, so they
# survive the container being replaced. `src/db/index.ts` creates the directory
# if it is missing, which is what lets a fresh volume work.
ENV NODE_ENV=production \
    PORT=8782 \
    MOX_DB=/data/mox.db \
    MOX_TMDB_CACHE=/data/tmdb-cache

RUN npm run build

# The build wrote into /app as root; the app runs as node and the nightly
# refresh writes to /data through the volume.
RUN chown -R node:node /app
USER node

EXPOSE 8782
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "8782"]
