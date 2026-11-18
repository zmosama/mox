#!/bin/sh
# Build MOX for the Apple TV and put it on the television.
#
# With a free Apple account the app stops opening after 7 days; running this
# again is the whole cure — the build mints a fresh 7-day profile. The Apple TV
# must be awake and on the same network as this Mac. It was paired with the
# Mac once (Settings > Remotes and Devices > Remote App and Devices); that
# pairing is kept.
#
#   ios/install-tv.sh               the Living Room Apple TV
#   ios/install-tv.sh "Bedroom"     another one, by its name
#
# Release, never Debug: a Debug build looks for the server on localhost, which
# on a television is the television.
set -eu
cd "$(dirname "$0")"
TV="${1:-Living Room}"

xcodebuild -project MOX.xcodeproj -scheme MOXTV -configuration Release \
  -destination "platform=tvOS,name=$TV" \
  -allowProvisioningUpdates -derivedDataPath build build | grep -E "error|BUILD"

xcrun devicectl device install app --device "$TV" \
  build/Build/Products/Release-appletvos/MOXTV.app | tail -1
echo "MOX is on \"$TV\"."
