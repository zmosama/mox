#!/bin/bash
# Ship mox to the VPS.
#
#   ./deploy/vps.sh
#
# GitHub is the path: this pushes, then the server pulls, builds and swaps. The
# server never receives anything that is not on main, so what is running can
# always be identified by a commit.
#
# Two things make it safe to run on a live site. The build happens while the old
# container is still serving, so a build that fails changes nothing. And the
# image being replaced is tagged first, so a new one that starts but does not
# answer is put back within seconds.
#
# The old deploy/deploy.sh targeted a Mac on the home network and has not been
# production since the site moved here.
set -euo pipefail

HOST=${MOX_VPS:-mox}
REPO=${MOX_REPO:-https://github.com/zmosama/mox.git}
BUILD=${MOX_BUILD_DIR:-/srv/build/mox}
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

say "fetching $REPO on the server"
ssh "$HOST" "set -e
  mkdir -p $(dirname "$BUILD")
  if [ -d $BUILD/.git ]; then git -C $BUILD fetch --quiet origin main && git -C $BUILD reset --quiet --hard origin/main
  else git clone --quiet $REPO $BUILD; fi
  git -C $BUILD rev-parse --short HEAD | sed 's/^/    server is at /'"

say "keeping the current image as the way back"
ssh "$HOST" "docker tag local/mox:latest local/mox:rollback && echo '    tagged local/mox:rollback'"

# The old container keeps serving throughout this. A build that runs out of
# memory on a 2GB box fails here and changes nothing.
say "building (the site stays up)"
ssh "$HOST" "cd $BUILD && docker build --quiet -t local/mox:latest . | sed 's/^/    /'"

say "swapping the container"
ssh "$HOST" "cd $APPS && docker compose up -d mox 2>&1 | sed 's/^/    /'"

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
echo "    running $(git rev-parse --short HEAD); previous image kept as local/mox:rollback"
