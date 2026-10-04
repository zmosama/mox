#!/bin/bash
# Ship mox to the VPS.
#
#   ./deploy/vps.sh
#
# The image is built HERE and shipped. The VPS has one core and 1.9GB of RAM
# behind a swapfile, with a live site running on it — building there works, but
# it takes the box to the edge of its memory to do it, and this was settled
# before: the Mac builds, the server receives.
#
# It still pushes to GitHub first and refuses a dirty tree, so whatever is
# running can always be named by a commit.
#
# Two things make it safe to run on a live site. Everything slow happens while
# the old container is still serving, so a failure before the swap changes
# nothing. And the image being replaced is tagged first, so a new one that
# starts but does not answer is put back within seconds.
#
# The old deploy/deploy.sh targeted a Mac on the home network and has not been
# production since the site moved here.
set -euo pipefail

HOST=${MOX_VPS:-mox}
APPS=${MOX_APPS_DIR:-/srv/apps}
URL=${MOX_URL:-https://mox.mosama.me}

say() { printf '\n==> %s\n' "$*"; }

say "checking the working tree"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "!! uncommitted changes — commit them first, the server builds from main" >&2
  exit 1
fi
git push origin main
echo "    main is $(git rev-parse --short HEAD)"

say "backing up the database"
# VACUUM INTO, not a copy: SQLite runs in WAL mode and anything rated since the
# last checkpoint lives in mox.db-wal, so copying the main file alone silently
# takes a stale one.
ssh "$HOST" "docker exec apps-mox-1 node -e \"
  const D=require('better-sqlite3');
  const db=new D('/data/mox.db',{readonly:true});
  require('fs').rmSync('/data/predeploy.db',{force:true});
  db.exec(\\\"vacuum into '/data/predeploy.db'\\\");
\" && ls -lh /srv/apps/mox/data/predeploy.db | awk '{print \"    \" \$5}'"

say "building here"
if ! docker info >/dev/null 2>&1; then
  echo "!! Docker is not running — start Docker Desktop and try again" >&2
  exit 1
fi
# This Mac is arm64 and the droplet is x86_64, so the platform is not optional:
# without it the image builds happily and then will not start over there.
# Not piped into anything. `set -o pipefail` covers a pipeline's exit status,
# but Docker Desktop failing mid-build once printed its error, exited through a
# `| tail`, and let the script carry on as if it had worked — which is how a
# deploy ships nothing and says it succeeded.
if ! docker build --platform linux/amd64 -t local/mox:latest . ; then
  echo "!! the build failed — nothing was shipped, the site is untouched" >&2
  exit 1
fi

say "keeping the current image as the way back"
ssh "$HOST" "docker tag local/mox:latest local/mox:rollback && echo '    tagged local/mox:rollback'"

# The old container keeps serving throughout the transfer.
say "shipping it (about 200MB compressed, the site stays up)"
docker save local/mox:latest | gzip | ssh "$HOST" "gunzip | docker load" | sed 's/^/    /'

say "swapping the container"
ssh "$HOST" "cd $APPS && docker compose up -d mox 2>&1 | sed 's/^/    /'"

# After the swap, never before: the old container is still reading the old
# schema while it serves, so a migration that drops a column it selects would
# break the live site for the length of the transfer. Migrations are therefore
# written to be safe for the new code against the old schema, and run here.
say "migrating the database"
ssh "$HOST" "docker exec apps-mox-1 npx drizzle-kit migrate 2>&1 | grep -E 'applied|error|Error' | sed 's/^/    /'"

say "checking it answers"
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 3
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/api/app/home" || true)
  if [ "$code" = "200" ]; then echo "    $URL -> 200"; ok=1; break; fi
  echo "    attempt $i: $code"
done

if [ "$ok" != "1" ]; then
  say "!! it never answered — rolling back"
  ssh "$HOST" "docker tag local/mox:rollback local/mox:latest && cd $APPS && docker compose up -d mox"
  sleep 5
  echo "    rolled back; $URL -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/" || echo unreachable)"
  exit 1
fi

say "done"
ssh "$HOST" "rm -f /srv/apps/mox/data/predeploy.db"
# Every deploy leaves the image it replaced behind, untagged — 4GB each. Only
# latest and rollback are ever used, so the rest go. (On 2026-10-05 27 of them
# had taken the disk from 34GB free to 14GB.)
ssh "$HOST" "docker image prune -f | tail -1 | sed 's/^/    /'"
echo "    running $(git rev-parse --short HEAD); previous image kept as local/mox:rollback"
