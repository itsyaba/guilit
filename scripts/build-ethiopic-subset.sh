#!/usr/bin/env bash
# Rebuild assets/fonts/NotoSansEthiopic-Ethiopic-400-600.woff2.
#
# The full Noto Sans Ethiopic variable face is 1.1 MB of TTF. Our users are on
# metered mobile data, so we ship only what we actually render:
#
#   * the Ethiopic block and its supplement (U+1200-139F), no Latin -- Archivo
#     already covers Latin, and duplicating it would be dead weight
#   * the weight axis clamped to 400-600, the only weights the UI uses
#   * the width axis pinned, and GPOS kerning dropped (Ethiopic does not kern)
#
# Result: ~30 KB for every weight we need, in one file.
#
# The output is committed, so a normal build needs none of this. Run it only
# when the weight range or codepoint coverage changes.
#
# Requires: python3 with fonttools and brotli (pip install fonttools brotli)

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO/assets/fonts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SRC="https://github.com/google/fonts/raw/main/ofl/notosansethiopic"

echo "Downloading upstream face..."
curl -sSL -o "$WORK/noto.ttf" "$SRC/NotoSansEthiopic%5Bwdth%2Cwght%5D.ttf"
curl -sSL -o "$OUT/OFL.txt" "$SRC/../notosansethiopic/OFL.txt" 2>/dev/null \
  || curl -sSL -o "$OUT/OFL.txt" "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansethiopic/OFL.txt"

echo "Pinning axes..."
python3 -m fontTools.varLib.instancer "$WORK/noto.ttf" wdth=100 wght=400:600 \
  -o "$WORK/instanced.ttf" >/dev/null

echo "Subsetting to the Ethiopic block..."
mkdir -p "$OUT"
python3 -m fontTools.subset "$WORK/instanced.ttf" \
  --unicodes="U+1200-137F,U+1380-139F,U+0020" \
  --layout-features="" \
  --flavor=woff2 \
  --output-file="$OUT/NotoSansEthiopic-Ethiopic-400-600.woff2"

printf 'Done: %s bytes\n' "$(stat -c%s "$OUT/NotoSansEthiopic-Ethiopic-400-600.woff2")"
