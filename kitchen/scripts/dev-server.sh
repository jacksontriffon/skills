#!/usr/bin/env bash
# Start or stop the dev servers /design-review and /evidence capture against.
#
#   .claude/kitchen/scripts/dev-server.sh start   # prints the Expo web URL on stdout, nothing else
#   .claude/kitchen/scripts/dev-server.sh stop
#   .claude/kitchen/scripts/dev-server.sh url     # print the URL of a server already started here
#
# Two processes, not one. The app carries no API of its own: it resolves auth and tRPC to a
# server the `stack` adapter starts, and `start` hands Metro that server's URL under
# kitchen.expo.apiUrlEnv, with any other NAME=value line the adapter prints. Capturing anything past
# the landing screen needs both up. A project whose `stack` is none has no API: Metro starts without one.
#
# Native simulators are out of reach in an agent container, so this is Expo **web**. Layout
# tracks the device closely enough for a fidelity pass; a screen resting on a native module
# renders as a gap, and that is a limit of the review rather than a finding against the build.
#
# Metro bundles on first request, so the first capture after `start` can sit for a minute with
# nothing on stdout. State lives in .claude/tmp/dev-server.*.
set -euo pipefail

KITCHEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$KITCHEN" rev-parse --show-toplevel)"
STATE_DIR="$REPO_ROOT/.claude/tmp"
WEB_PID_FILE="$STATE_DIR/dev-server.web.pid"
URL_FILE="$STATE_DIR/dev-server.url"
LOG_FILE="$STATE_DIR/dev-server.log"
READY_TIMEOUT="${READY_TIMEOUT:-300}"

mkdir -p "$STATE_DIR"

# shellcheck source=lib-env.sh
source "$KITCHEN/lib-env.sh"

kitchen() { node "$KITCHEN/kitchen.mjs" get "$1"; }
stack() { node "$KITCHEN/adapter.mjs" stack "$1"; }

port_is_free() {
  ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

find_free_port() {
  local port="${1:?}"
  while ! port_is_free "$port"; do port=$((port + 1)); done
  echo "$port"
}

# Waits on a URL rather than on the port, so a Metro that binds and then dies on a bundling
# error fails here instead of at the first capture.
await_url() {
  local url="$1" pid_file="$2" label="$3" waited=0
  until curl -sSf -o /dev/null "$url" 2>/dev/null; do
    if ! kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      echo "$label exited before answering; see $LOG_FILE" >&2
      tail -20 "$LOG_FILE" >&2
      return 1
    fi
    if ((waited >= READY_TIMEOUT)); then
      echo "$label did not answer within ${READY_TIMEOUT}s; see $LOG_FILE" >&2
      tail -20 "$LOG_FILE" >&2
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

start() {
  if [[ -f "$WEB_PID_FILE" ]] && kill -0 "$(cat "$WEB_PID_FILE")" 2>/dev/null; then
    cat "$URL_FILE"
    return 0
  fi

  local stack_out line api_url
  stack_out="$(stack up)"
  api_url="$(sed -n 's/^API_URL=//p' <<<"$stack_out" | tail -n1)"
  local -a metro_env=()
  local status
  while IFS= read -r line; do
    status=0
    env_assignment "adapter stack up" "$line" || status=$?
    case "$status" in
      0) [[ "$line" == API_URL=* ]] || metro_env+=("$line") ;;
      1) return 1 ;;
    esac
  done <<<"$stack_out"

  local app_dir package_manager web_port web_url
  app_dir="$(kitchen expo.appDir)"
  package_manager="$(kitchen packageManager)"
  # A stack with no API prints no API_URL, and the app is then started without one.
  if [[ -n "$api_url" ]]; then metro_env+=("$(kitchen expo.apiUrlEnv)=$api_url"); fi
  local -a runner
  case "$package_manager" in
    npm) runner=(npm exec --) ;;
    bun) runner=(bunx) ;;
    *) runner=("$package_manager" exec) ;;
  esac
  web_port="$(find_free_port "$(kitchen expo.webPort)")"
  web_url="http://localhost:$web_port"
  # With an API, its URL is not optional on web: the app's base-URL resolver falls back to a host
  # the Expo manifest carries, which web does not set, and throws.
  (cd "$REPO_ROOT/$app_dir" && exec env ${metro_env[@]+"${metro_env[@]}"} \
    setsid "${runner[@]}" expo start --web --port "$web_port") >>"$LOG_FILE" 2>&1 &
  echo $! >"$WEB_PID_FILE"
  echo "$web_url" >"$URL_FILE"
  await_url "$web_url" "$WEB_PID_FILE" "expo web server" || return 1

  echo "$web_url"
}

stop() {
  local pid waited
  if [[ -f "$WEB_PID_FILE" ]]; then
    pid="$(cat "$WEB_PID_FILE")"
    # pid names the process group, so this reaches everything Metro spawned.
    kill -- -"$pid" 2>/dev/null || true
    waited=0
    while kill -0 -- -"$pid" 2>/dev/null && ((waited < 50)); do
      sleep 0.1
      waited=$((waited + 1))
    done
    kill -s KILL -- -"$pid" 2>/dev/null || true
    rm -f "$WEB_PID_FILE"
  fi
  rm -f "$URL_FILE"
  stack down
}

case "${1:-start}" in
start) start ;;
stop) stop ;;
url) cat "$URL_FILE" ;;
*)
  echo "usage: ${BASH_SOURCE[0]} {start|stop|url}" >&2
  exit 1
  ;;
esac
