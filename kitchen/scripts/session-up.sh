#!/usr/bin/env bash
# Stand the whole app up inside an agent container: dependencies, database, the project's own
# hooks, the dev account, both servers, and a signed-in session. /evidence runs it once per
# checkout it shoots. Each backend step is the adapter kitchen.json names for its slot.
#
#   .claude/kitchen/scripts/session-up.sh up     # prints the Expo web URL on stdout, nothing else
#   .claude/kitchen/scripts/session-up.sh down
#
# `up` runs the sequence in full every time: the servers restart, because Metro serves the
# checkout it started in, and `db prepare` runs again, because a Before checkout can predate a
# table the branch added. A checkout with no node_modules is installed first.
#
# Every NAME=value line an adapter or a hook prints on stdout is exported to what runs after it,
# because the container's own database and service URLs are unreachable and dotenv never
# overrides a variable that is set. Anything run outside this script needs the same exports.
#
# .claude/session-up.d/ is the project's door: each executable in it runs in name order after
# `db prepare` and before the seed, as `<hook> up`, and in reverse as `<hook> down`.
set -euo pipefail

KITCHEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$KITCHEN" rev-parse --show-toplevel)"
HOOKS="$REPO_ROOT/.claude/session-up.d"

log() { echo "session-up: $*" >&2; }

# shellcheck source=lib-env.sh
source "$KITCHEN/lib-env.sh"

# export_lines <source> — exports each NAME=value line on stdin, and fails on one env_name_refused names.
export_lines() {
  local source="$1" line status
  while IFS= read -r line; do
    status=0
    env_assignment "$source" "$line" || status=$?
    case "$status" in
      0) export "${line?}" ;;
      1) return 1 ;;
    esac
  done
  return 0
}

adapter() {
  local out
  out="$(node "$KITCHEN/adapter.mjs" "$@")" || { log "adapter $* failed"; return 1; }
  export_lines "adapter $*" <<<"$out" || { log "adapter $* failed"; return 1; }
}

hooks() {
  local verb="$1" order="${2:-}" hook out
  [[ -d "$HOOKS" ]] || return 0
  while IFS= read -r hook; do
    [[ -x "$hook" ]] || continue
    out="$("$hook" "$verb")" || { log "hook ${hook##*/} failed"; return 1; }
    export_lines "hook ${hook##*/}" <<<"$out" || { log "hook ${hook##*/} failed"; return 1; }
  done < <(find "$HOOKS" -maxdepth 1 -type f | sort $order)
}

up() {
  cd "$REPO_ROOT"
  if [[ ! -d node_modules ]]; then
    local package_manager
    package_manager="$(node "$KITCHEN/kitchen.mjs" get packageManager)"
    log "installing dependencies"
    case "$package_manager" in
      npm) npm ci >&2 ;;
      *) "$package_manager" install --frozen-lockfile >&2 ;;
    esac
  fi
  adapter db prepare
  hooks up
  adapter auth seed
  "$KITCHEN/dev-server.sh" stop
  local url
  url="$("$KITCHEN/dev-server.sh" start)"
  adapter auth sign-in
  echo "$url"
}

down() {
  hooks down -r
  "$KITCHEN/dev-server.sh" stop
  node "$KITCHEN/adapter.mjs" db down
}

case "${1:-up}" in
up) up ;;
down) down ;;
*)
  echo "usage: ${BASH_SOURCE[0]} {up|down}" >&2
  exit 1
  ;;
esac
