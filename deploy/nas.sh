#!/bin/bash
# Ship mox to the TrueNAS, where it ran from 2026-11-18 to 2026-11-23.
#
#   MOX_DEPLOY_STANDBY=yes ./deploy/nas.sh
#
# NOT the live site right now: see the guard below and deploy/vps.sh.
#
# Nothing is built or uploaded from here. A push to main makes GitHub build the
# image (.github/workflows/image.yml) and keep it in its registry; this waits
# for that build, then has the TrueNAS pull it — only the layers that changed —
# restart the app on it, and bring the database up to date.
#
# The old way (deploy/vps.sh) built on this Mac and uploaded the whole image,
# 1.1GB for a one-line change.
#
# Safe on a live site: the database is snapshotted first (ZFS, instant), the
# image being replaced is remembered by its digest, and a new one that does
# not answer is replaced by the old one again.
set -euo pipefail

# mox moved back to the VPS on 2026-11-23 (deploy/vps.sh) while the home
# server is being relocated. The copy on the TrueNAS is a stopped standby: its
# data is frozen at that evening and its nightly jobs are disabled. This
# script would start it — beside the real one — and then report success,
# because the check at the end asks the public address, which the VPS answers.
#
# To move back here for good, the data has to come first: stop the app on the
# VPS, copy its database and data files over, then switch the `mox` record on
# Cloudflare to the TrueNAS tunnel and move the two cron jobs.
if [ "${MOX_DEPLOY_STANDBY:-}" != "yes" ]; then
  echo "!! mox runs on the VPS now — use ./deploy/vps.sh" >&2
  echo "   (to refresh the stopped standby on the TrueNAS on purpose: MOX_DEPLOY_STANDBY=yes $0)" >&2
  exit 1
fi

# The LAN address: the TrueNAS is beside the desk. From elsewhere, the tunnel:
#   MOX_NAS=truenas ./deploy/nas.sh
HOST=${MOX_NAS:-truenas_admin@192.168.1.150}
URL=${MOX_URL:-https://mox.mosama.me}
APP=mox
CONTAINER=ix-mox-mox-1
IMAGE=ghcr.io/zmosama/mox
DATASET=znas/apps

say() { printf '\n==> %s\n' "$*"; }
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

say "snapshotting the data"
ssh "$HOST" "sudo -n zfs snapshot $DATASET@predeploy-${SHA:0:7}-\$(date +%H%M%S) && echo '    $DATASET snapshotted'"

say "remembering the running image as the way back"
before=$(ssh "$HOST" "sudo -n docker inspect $CONTAINER --format '{{.Image}}' 2>/dev/null || true")
echo "    ${before:0:19}"

say "pulling the new image and restarting on it"
ssh "$HOST" "sudo -n docker pull $IMAGE:latest | tail -1 | sed 's/^/    /' && sudo -n midclt call -j app.redeploy $APP >/dev/null 2>&1 && echo '    restarted'"

# After the restart, never before: the old container is still reading the old
# schema while it serves. Migrations are written to be safe for the new code
# against the old schema, and a failed one fails the deploy.
say "migrating the database"
migrated=1
if ! ssh "$HOST" "set -o pipefail; sudo -n docker exec $CONTAINER npx drizzle-kit migrate 2>&1 | grep -v 'npm notice' | sed 's/^/    /'"; then
  echo "!! the migration failed" >&2
  migrated=0
fi

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
    # The app is set to use the image it has rather than pull one (pull_policy
    # "missing"), so naming the old image "latest" again is all it takes.
    ssh "$HOST" "sudo -n docker tag $before $IMAGE:latest && sudo -n midclt call -j app.redeploy $APP >/dev/null"
    sleep 6
  fi
  echo "    $URL -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL/" || echo unreachable)"
  echo "    the data as it was is in the snapshot $DATASET@predeploy-${SHA:0:7}-*" >&2
  exit 1
fi

say "done"
ssh "$HOST" "sudo -n docker image prune -f | tail -1 | sed 's/^/    /'"
echo "    running ${SHA:0:7} on the TrueNAS"
