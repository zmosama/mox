#!/bin/bash
# Keep MOX alive on the phone.
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
DEVICE=${MOX_IOS_DEVICE:-00008130-000C18300EE0001C}
# Three days of slack: enough that a phone left off the network for a long
# weekend still gets caught before anybody notices the app is gone.
RENEW_WITHIN_DAYS=${MOX_IOS_RENEW_WITHIN:-3}
APP="$HERE/ios/build/Build/Products/Release-iphoneos/MOX.app"

say() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M')" "$*"; }

expires_in_days() {
  local profile="$1"
  [ -f "$profile" ] || { echo -1; return; }
  local iso
  iso=$(security cms -D -i "$profile" 2>/dev/null | plutil -extract ExpirationDate raw - 2>/dev/null) || true
  [ -n "$iso" ] || { echo -1; return; }
  local end now
  end=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" "+%s" 2>/dev/null) || { echo -1; return; }
  now=$(date "+%s")
  echo $(( (end - now) / 86400 ))
}

left=$(expires_in_days "$APP/embedded.mobileprovision")

if [ "${1:-}" != "--force" ] && [ "$left" -gt "$RENEW_WITHIN_DAYS" ]; then
  say "signing has ${left}d left — nothing to do"
  exit 0
fi
say "signing has ${left}d left — renewing"

# Reachability first. Not `devicectl list devices`, whose State column reports a
# perfectly connected phone as "unavailable"; ask the device itself.
if ! xcrun devicectl device info details --device "$DEVICE" --timeout 30 2>/dev/null \
     | grep -q "Device State: connected"; then
  say "!! phone is not reachable — will try again tomorrow"
  exit 1
fi

# Release, never Debug: AppSettings.defaultServer is localhost:3000 under
# #if DEBUG, and on a phone localhost is the phone. A Debug build installs and
# launches perfectly and then cannot reach anything.
say "building"
xcodebuild -project "$HERE/ios/MOX.xcodeproj" -scheme MOX -configuration Release \
  -destination "platform=iOS,id=$DEVICE" \
  -allowProvisioningUpdates -derivedDataPath "$HERE/ios/build" \
  build >/dev/null

now_left=$(expires_in_days "$APP/embedded.mobileprovision")
if [ "$now_left" -le "$left" ]; then
  say "!! the build did not mint a newer profile (${now_left}d) — not installing"
  exit 1
fi

say "installing"
xcrun devicectl device install app --device "$DEVICE" "$APP" >/dev/null
say "done — good for ${now_left} more days"
