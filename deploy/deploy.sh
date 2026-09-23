#!/bin/bash
# Push mox to your server and restart it.
#
#   cp deploy/target.env.example deploy/target.env   # once, with your details
#   ./deploy/deploy.sh
#
# Code only. The server owns the database — an earlier version of this script
# rsynced the local data up as well and silently overwrote whatever had been
# rated or followed on the site since the last deploy.
#
# Nothing about any particular server lives in this file. `deploy/target.env`
# holds that, and it is ignored by Git.
set -euo pipefail

HERE=$(cd "$(dirname "$0")/.." && pwd)
CONF="$HERE/deploy/target.env"

# shellcheck source=/dev/null
[ -f "$CONF" ] && . "$CONF"

HOST=${MOX_HOST:-}
DEST=${MOX_DEST:-}
PORT=${MOX_PORT:-8782}
LABEL=${MOX_LABEL:-}
FEEDS_HOUR=${MOX_FEEDS_HOUR:-4}
FEEDS_MINUTE=${MOX_FEEDS_MINUTE:-30}
# Agents from an earlier naming scheme. Renaming a LaunchAgent otherwise
# leaves the old one loaded and two copies of the app fighting over the port.
RETIRED=${MOX_RETIRED_LABELS:-}

if [ -z "$HOST" ] || [ -z "$DEST" ] || [ -z "$LABEL" ]; then
  echo "!! no deploy target configured" >&2
  echo "   cp deploy/target.env.example deploy/target.env and fill it in," >&2
  echo "   or set MOX_HOST, MOX_DEST and MOX_LABEL in the environment." >&2
  exit 1
fi

echo "==> deploying to $HOST:$DEST"

echo "==> backing up the server database first"
# VACUUM INTO on the server, not a plain copy of mox.db: the database runs in
# WAL mode, so anything rated or followed since the last checkpoint lives in
# mox.db-wal and a copy of the main file alone silently arrives stale.
mkdir -p "$HERE/backup"
# Errors are NOT swallowed here. The previous version piped this whole step to
# /dev/null and appended `|| true`, which hid the fact that macOS rsync has no
# --ignore-missing-args: the step printed a reassuring line and copied nothing,
# every deploy, for as long as it existed.
ssh "$HOST" "cd $DEST && rm -f data/backup.db && \
  sqlite3 data/mox.db \"VACUUM INTO 'data/backup.db'\""
rsync -az "$HOST:$DEST/data/backup.db" "$HERE/backup/mox.db"
ssh "$HOST" "rm -f $DEST/data/backup.db"

if [ ! -s "$HERE/backup/mox.db" ]; then
  echo "!! could not back up the server database — refusing to deploy" >&2
  exit 1
fi
echo "    backed up $(du -h "$HERE/backup/mox.db" | cut -f1)"

echo "==> syncing code to $HOST:$DEST"
# ios/ is the iPhone app, built on this Mac; the server never needs it, and its
# build output alone is hundreds of megabytes.
ssh "$HOST" "mkdir -p $DEST/data"
rsync -az --delete \
  --exclude 'node_modules/' --exclude '.next/' --exclude '.git/' \
  --exclude 'data/' --exclude 'backup/' --exclude 'legacy/' \
  --exclude '.env.local' --exclude 'ios/' \
  "$HERE"/ "$HOST:$DEST/"

echo "==> installing"
# The full tree, not --omit=dev: the build needs the compiler and the
# migration step needs drizzle-kit, both of which are dev dependencies.
ssh "$HOST" "export PATH=\$HOME/.local/bin:/opt/homebrew/bin:\$PATH; cd $DEST && npm ci --silent || npm install --silent"

echo "==> migrating the database"
# Before the build, and never destructive: drizzle applies only the migrations
# the server has not seen. Without this a schema change ships as code the
# database cannot answer, and every page touching the new column 500s.
ssh "$HOST" "export PATH=\$HOME/.local/bin:/opt/homebrew/bin:\$PATH; cd $DEST && npx drizzle-kit migrate"

echo "==> making sure there is an owner"
ssh "$HOST" "export PATH=\$HOME/.local/bin:/opt/homebrew/bin:\$PATH; cd $DEST && npx tsx scripts/ensure-owner.mts"

echo "==> building"
ssh "$HOST" "export PATH=\$HOME/.local/bin:/opt/homebrew/bin:\$PATH; cd $DEST && npm run build"

# The LaunchAgents are rendered on the server rather than committed: a plist
# needs absolute paths, and hard-coding one install's paths is how a personal
# server ends up in a public repository.
render() {
  ssh "$HOST" "sed -e 's|__DEST__|$DEST|g' -e 's|__LABEL__|$2|g' \
    -e 's|__PORT__|$PORT|g' \
    -e 's|__FEEDS_HOUR__|$FEEDS_HOUR|g' -e 's|__FEEDS_MINUTE__|$FEEDS_MINUTE|g' \
    $DEST/deploy/launchd/$1 > ~/Library/LaunchAgents/$2.plist && \
    launchctl unload ~/Library/LaunchAgents/$2.plist 2>/dev/null; \
    launchctl load ~/Library/LaunchAgents/$2.plist"
}

for old_label in $RETIRED; do
  echo "==> retiring $old_label"
  ssh "$HOST" "launchctl unload ~/Library/LaunchAgents/$old_label.plist 2>/dev/null; \
    rm -f ~/Library/LaunchAgents/$old_label.plist"
done

echo "==> restarting"
render app.plist.template "$LABEL.app"

echo "==> scheduling the nightly refresh"
# Reloading it here is also what brings the site current on a deploy: the
# agent is RunAtLoad, so it runs now rather than at the next scheduled time.
render refresh.plist.template "$LABEL.refresh"

sleep 4
ssh "$HOST" "curl -s -o /dev/null -w 'local / -> %{http_code}\n' http://127.0.0.1:$PORT/"
echo "done."
