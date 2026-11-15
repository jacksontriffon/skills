# shellcheck shell=bash disable=SC2034
# Sourced after lib.sh by the supabase adapters that are shell scripts. `command` names how to run
# the CLI (default `supabase`; `npx supabase` for one in the project's dependencies) and `dir` the
# directory that holds supabase/ (default the repo root), both on the adapter's own slot.

read -ra SUPABASE_CMD <<<"$(setting settings.command supabase)"
SUPABASE_DIR="$REPO_ROOT/$(setting settings.dir .)"
SLOT="$(setting slot)"
STATUS=""

fail() { echo "$SLOT: $*" >&2; exit 1; }

# Every line the CLI prints on stdout moves to stderr, so an adapter's own stdout is only what it means to say.
sb() { (cd "$SUPABASE_DIR" && "${SUPABASE_CMD[@]}" "$@" >&2); }

cli_present() { command -v "${SUPABASE_CMD[0]}" >/dev/null 2>&1; }

require_cli() {
  cli_present || fail "${SUPABASE_CMD[0]} is not on the path. Install the Supabase CLI, or say how to run it in adapters.$SLOT.command"
}

is_running() {
  STATUS="$(cd "$SUPABASE_DIR" && "${SUPABASE_CMD[@]}" status -o env 2>/dev/null)"
}

# Idempotent: a stack that answers status is left alone.
ensure_started() {
  require_cli
  is_running && return 0
  echo "$SLOT: starting the local stack" >&2
  sb start
  is_running || fail "the local stack was started and does not answer \`status\`"
}

stop_stack() {
  cli_present || return 0
  if is_running; then sb stop; fi
  return 0
}

status_value() {
  printf '%s\n' "$STATUS" | node "$(dirname "${BASH_SOURCE[0]}")/supabase-status.mjs" "$1"
}
