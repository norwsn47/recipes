#!/bin/sh
# Regenerates public/favicon.png (64x64) and public/apple-touch-icon.png (180x180) from
# scripts/favicon.html using headless Chrome, then sips to scale down.
# Run from anywhere: sh scripts/favicon.sh   (or: npm run favicon). Needs network for the Google Font.
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
PUB="$(cd "$DIR/../public" && pwd)"
TMP="$(mktemp -d)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=512,512 --virtual-time-budget=10000 \
  --screenshot="$TMP/icon.png" "file://$DIR/favicon.html" 2>/dev/null
sips -z 64 64 "$TMP/icon.png" --out "$PUB/favicon.png" >/dev/null
sips -z 180 180 "$TMP/icon.png" --out "$PUB/apple-touch-icon.png" >/dev/null
rm -rf "$TMP"
echo "Wrote $PUB/favicon.png and $PUB/apple-touch-icon.png"
