#!/bin/bash
# Keep MOX alive on the iPhone and the iPad.
#
#   ./scripts/ios-refresh.sh [--force]
#
# A free Apple account signs an app for seven days. When that lapses the app
# stops launching, and — this is the part worth engineering around — iOS also
# drops its trust in the developer, so recovering needs somebody to walk into
# Settings and tap Trust. Reinstalling while the old profile is still valid
# replaces it silently: no taps, no notice, the app simply never expires.
#
# So this runs daily and does nothing on most days. It rebuilds only when the
# profile is inside its last few days, which also means a day the phone was off
# the network costs nothing — tomorrow's run catches it.
set -euo pipefail

HERE=$(cd "$(dirname "$0")/.." && pwd)
# The iPhone and the iPad. One build serves both: the profile Xcode mints
# names every registered device.
DEVICES=${MOX_IOS_DEVICES:-"00008130-000C18300EE0001C 00008142-001A454E0C6B801C"}
# Three days of slack: enough that a device left off the network for a long
# weekend still gets caught before anybody notices the app is gone.
RENEW_WITHIN_DAYS=${MOX_IOS_RENEW_WITHIN:-3}
APP="$HERE/ios/build/Build/Products/Release-iphoneos/MOX.app"
# Which profile each device last received, so one that was away on renewal
# day is caught up the next time it is reachable rather than a week late.
STATE="$HOME/Library/Application Support/mox-ios"
mkdir -p "$STATE"

say() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M')" "$*"; }

expires_at() {
  local profile="$1"
  [ -f "$profile" ] || { echo 0; return; }
  local iso
  iso=$(security cms -D -i "$profile" 2>/dev/null | plutil -extract ExpirationDate raw - 2>/dev/null) || true
  [ -n "$iso" ] || { echo 0; return; }
  date -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" "+%s" 2>/dev/null || echo 0
}

# Reachability: not `devicectl list devices`, whose State column reports a
# perfectly connected device as "unavailable"; ask the device itself.
reachable() {
  xcrun devicectl device info details --device "$1" --timeout 30 2>/dev/null | grep -q "Device State: connected"
}

end=$(expires_at "$APP/embedded.mobileprovision")
left=$(( (end - $(date +%s)) / 86400 ))

if [ "${1:-}" = "--force" ] || [ "$left" -le "$RENEW_WITHIN_DAYS" ]; then
  say "signing has ${left}d left — renewing"
  # Release, never Debug: AppSettings.defaultServer is localhost:3000 under
  # #if DEBUG, and on a device localhost is the device.
  xcodebuild -project "$HERE/ios/MOX.xcodeproj" -scheme MOX -configuration Release \
    -destination "generic/platform=iOS" \
    -allowProvisioningUpdates -derivedDataPath "$HERE/ios/build" \
    build >/dev/null
  new_end=$(expires_at "$APP/embedded.mobileprovision")
  if [ "$new_end" -le "$end" ]; then
    say "!! the build did not mint a newer profile — not installing"
    exit 1
  fi
  end=$new_end
fi

failed=0
for device in $DEVICES; do
  had=$(cat "$STATE/$device" 2>/dev/null || echo 0)
  [ "$had" -ge "$end" ] && continue
  if ! reachable "$device"; then
    say "!! $device is not reachable — will try again tomorrow"
    failed=1
    continue
  fi
  say "installing on $device"
  if xcrun devicectl device install app --device "$device" "$APP" >/dev/null; then
    echo "$end" > "$STATE/$device"
  else
    failed=1
  fi
done

say "done — good until $(date -r "$end" '+%Y-%m-%d')"
exit $failed
