#!/usr/bin/env bash
# Serve the committed Claude Design export in kitchen.json's `design` folder for /design-review.
#
#   .claude/kitchen/scripts/design-server.sh start   # prints the base URL on stdout, nothing else
#   .claude/kitchen/scripts/design-server.sh stop
#
# The export is served from a copy, not from the design folder itself, so the
# `dc-offline.js` shim can be injected into each .dc.html without the committed
# files drifting from what Claude Design exported.
#
# The shim matters: support.js pulls React from unpkg.com, which is unreachable
# from sandboxed agent environments.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
SOURCE_DIR="$REPO_ROOT/$(node "$HERE/kitchen.mjs" get design)"
STATE_DIR="$REPO_ROOT/.claude/tmp"
SERVE_DIR="$STATE_DIR/design-serve"
PID_FILE="$STATE_DIR/design-server.pid"
URL_FILE="$STATE_DIR/design-server.url"

mkdir -p "$STATE_DIR"

port_is_free() {
  ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

start() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    cat "$URL_FILE"
    return 0
  fi

  [[ -d "$SOURCE_DIR" ]] || { echo "no design export at $SOURCE_DIR" >&2; return 1; }

  rm -rf "$SERVE_DIR"
  mkdir -p "$SERVE_DIR"
  cp -R "$SOURCE_DIR"/. "$SERVE_DIR"/

  python3 - "$SERVE_DIR" <<'PY'
import pathlib, sys
shim = '<script src="./dc-offline.js"></script>\n'
for path in pathlib.Path(sys.argv[1]).rglob("*.dc.html"):
    html = path.read_text(encoding="utf-8")
    if "dc-offline.js" in html:
        continue
    html = html.replace("https://unpkg.com/d3@7.9.0/dist/d3.min.js", "./vendor/d3.min.js")
    html = html.replace(
        "https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js",
        "./vendor/topojson-client.min.js",
    )
    marker = '<script src="./support.js"></script>'
    if marker not in html:
        print(f"warning: no support.js tag in {path.name}", file=sys.stderr)
        continue
    path.write_text(html.replace(marker, shim + marker, 1), encoding="utf-8")
PY

  local port=8800
  while ! port_is_free "$port"; do port=$((port + 1)); done

  (cd "$SERVE_DIR" && exec python3 -m http.server "$port" >/dev/null 2>&1) &
  echo $! >"$PID_FILE"
  echo "http://localhost:$port" >"$URL_FILE"

  local waited=0
  until curl -sSf -o /dev/null "http://localhost:$port/" 2>/dev/null; do
    if (( waited >= 20 )); then echo "design server did not start" >&2; return 1; fi
    sleep 1
    waited=$((waited + 1))
  done

  cat "$URL_FILE"
}

stop() {
  [[ -f "$PID_FILE" ]] || return 0
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE" "$URL_FILE"
  rm -rf "$SERVE_DIR"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: ${BASH_SOURCE[0]} {start|stop}" >&2; exit 1 ;;
esac
