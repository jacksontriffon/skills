#!/usr/bin/env bash
# Shoot a committed Claude Design export from kitchen.json's `design` folder, one PNG per
# chip, into <out-dir>.
#
#   .claude/kitchen/scripts/shoot-design.sh <file>.dc.html <desktop|phone> <out-dir> "<chip>" ["<chip>"...]
#
# A chip is one click on an export's rail (`06 VIDEO`), shot at `desktop`. An export with no
# rail is driven like the app, so its chip is a tap path joined by `>` (`Library > Words`),
# shot at `phone`. Each shot is <slug>-design.png, the slug being the chip lowercased with
# every run of other characters made a `-`. It needs no app and no database.
#
# CAPTURE swaps the browser script out, for the test.
set -euo pipefail

design="${1:?usage: shoot-design.sh <file>.dc.html <desktop|phone> <out-dir> <chip>...}"
viewport="${2:?}"
out="${3:?}"
shift 3
(($# > 0)) || { echo "no chip given" >&2; exit 1; }

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPTS" rev-parse --show-toplevel)"
capture="${CAPTURE:-$SCRIPTS/capture.mjs}"
folder="$(node "$SCRIPTS/kitchen.mjs" get design)"

[[ -f "$REPO_ROOT/$folder/$design" ]] || { echo "$folder/$design is not committed" >&2; exit 1; }
[[ -d "$REPO_ROOT/$folder/_ds" ]] || echo "$folder/_ds is missing, so the design renders with fallback fonts" >&2

mkdir -p "$out"
base="$("$SCRIPTS/design-server.sh" start)"
trap '"$SCRIPTS/design-server.sh" stop' EXIT
url="$base/$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$design")"

size=()
if [[ "$viewport" == desktop ]]; then size=(--desktop); fi

for chip in "$@"; do
  slug="$(echo "$chip" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g')"
  clicks=()
  IFS='>' read -ra taps <<<"$chip"
  for tap in "${taps[@]}"; do
    clicks+=(--click "$(echo "$tap" | xargs)")
  done
  node "$capture" "${size[@]}" --url "$url" "${clicks[@]}" --out "$out/$slug-design.png" >&2
  echo "$out/$slug-design.png"
done
