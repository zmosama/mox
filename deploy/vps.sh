#!/bin/bash
# Ship mox to the VPS, where it runs again since 2026-11-23.
#
#   ./deploy/vps.sh
#
# Nothing is built or uploaded from here. A push to main makes GitHub build the
# image (.github/workflows/image.yml) and keep it in its registry; this waits
# for that build, then has the VPS pull it — only the layers that changed —
# restart the app on it, and bring the database up to date.
#
# Where mox has run:
#   2026-09-29  the VPS, image built on this Mac and uploaded whole (1.1GB)
#   2026-11-18  the TrueNAS at home, image built by GitHub (deploy/nas.sh)
#   2026-11-23  the VPS again, same GitHub image: the home server is being
#               moved and will be off. The copy on the TrueNAS is a stopped
#               standby with its nightly jobs disabled.
#
# Safe on a live site: everything slow happens while the old container is
# still serving, the database is copied first, the image being replaced is
# remembered by its id, and a new one that does not answer is replaced by the
# old one again.
set -euo pipefail

HOST=${MOX_VPS:-mox}
APPS=${MOX_APPS_DIR:-/srv/apps}
URL=${MOX_URL:-https://mox.mosama.me}
CONTAINER=apps-mox-1
IMAGE=ghcr.io/zmosama/mox

say() { printf '\n==> %s\n' "$*"; }

# Every ssh here notices a dead connection within two minutes and fails,
# rather than waiting forever: on 2026-10-05 a link from the Mac that dropped
# mid-deploy left two deploys hanging until they were killed.
ssh() { command ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=8 "$@"; }

say "checking the working tree"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "!! uncommitted changes — commit them first, GitHub builds from main" >&2
  exit 1
fi
git push origin main
SHA=$(git rev-parse HEAD)
echo "    main is ${SHA:0:7}"

say "waiting for GitHub to build ${SHA:0:7}"
run=""
for _ in $(seq 1 30); do
  run=$(gh run list --workflow image.yml --commit "$SHA" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  [ -n "$run" ] && break
  sleep 4
done
if [ -z "$run" ]; then
  echo "!! GitHub never started a build for this commit — the site is untouched" >&2
  exit 1
fi
if ! gh run watch "$run" --exit-status >/dev/null; then
  echo "!! GitHub's build failed — the site is untouched:  gh run view $run --log-failed" >&2
  exit 1
fi
echo "    built"

say "backing up the database"
# VACUUM INTO, not a copy: SQLite runs in WAL mode and anything rated since the
# last checkpoint lives in mox.db-wal, so copying the main file alone silently
# takes a stale one.
ssh "$HOST" "docker exec $CONTAINER node -e \"
  const D=require('better-sqlite3');
  const db=new D('/data/mox.db',{readonly:true});
  require('fs').rmSync('/data/predeploy.db',{force:true});
  db.exec(\\\"vacuum into '/data/predeploy.db'\\\");
\" && ls -lh $APPS/mox/data/predeploy.db | awk '{print \"    \" \$5}'"

say "remembering the running image as the way back"
before=$(ssh "$HOST" "docker inspect $CONTAINER --format '{{.Image}}' 2>/dev/null || true")
echo "    ${before:0:19}"

# The commit's own tag, not `latest`: it is exactly what GitHub just built,
# whatever else has been pushed since. Compose runs `latest`, so it is named
# that here. The old container keeps serving until the swap.
say "pulling the new image (the site stays up)"
ssh "$HOST" "docker pull -q $IMAGE:$SHA | sed 's/^/    /' && docker tag $IMAGE:$SHA $IMAGE:latest"

say "swapping the container"
# The service is named: a bare `up -d` would look at every other app in the
# compose file too.
ssh "$HOST" "cd $APPS && docker compose up -d mox 2>&1 | sed 's/^/    /'"

# After the swap, never before: the old container is still reading the old
# schema while it serves, so a migration that drops a column it selects would
# break the live site for the length of the pull. Migrations are therefore
# written to be safe for the new code against the old schema, and run here.
# A migration that fails must fail the deploy and take the rollback below.
say "migrating the database"
migrated=1
if ! ssh "$HOST" "set -o pipefail; docker exec $CONTAINER npx drizzle-kit migrate 2>&1 | grep -v 'npm notice' | sed 's/^/    /'"; then
  echo "!! the migration failed" >&2
  migrated=0
fi

# Two screens that read different tables, so a column the new code expects
# and the database lacks shows up as a failure here, not on someone's phone.
say "checking it answers"
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  [ "$migrated" = "1" ] || break
  sleep 3
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/api/app/home" || true)
  news=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/api/news" || true)
  if [ "$code" = "200" ] && [ "$news" = "200" ]; then echo "    $URL -> 200, news 200"; ok=1; break; fi
  echo "    attempt $i: home $code, news $news"
done

if [ "$ok" != "1" ]; then
  say "!! it never answered — putting the old image back"
  if [ -n "$before" ]; then
    ssh "$HOST" "docker tag $before $IMAGE:latest && cd $APPS && docker compose up -d mox"
    sleep 6
  fi
  echo "    $URL -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/" || echo unreachable)"
  echo "    the database as it was is in $APPS/mox/data/predeploy.db" >&2
  exit 1
fi

say "done"
ssh "$HOST" "rm -f $APPS/mox/data/predeploy.db"
# Every deploy leaves the image it replaced behind, 1.2GB each, and every
# commit's tag keeps one alive. Only the running one is needed.
ssh "$HOST" "docker images $IMAGE --format '{{.Repository}}:{{.Tag}}' | grep -v ':latest\$' | grep -v ':$SHA\$' | xargs -r docker rmi >/dev/null 2>&1 || true; docker image prune -f | tail -1 | sed 's/^/    /'"
echo "    running ${SHA:0:7} on the VPS"
