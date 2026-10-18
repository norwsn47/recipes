#!/bin/sh
# Regenerates public/og-image.png (1200x630) from scripts/og-image.html using headless Chrome.
# Run from anywhere: sh scripts/og-image.sh   (or: npm run og-image). Needs network for the Google Font.
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/../public/og-image.png"
OUT="$(cd "$(dirname "$OUT")" && pwd)/og-image.png"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=10000 \
  --screenshot="$OUT" "file://$DIR/og-image.html" 2>/dev/null
echo "Wrote $OUT"
