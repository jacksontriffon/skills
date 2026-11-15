#!/usr/bin/env bash
# Shoot each flow on the branch and on its merge-base, into one folder of named PNGs.
#
#   .claude/kitchen/scripts/shoot-pair.sh <out-dir> <flow.yaml>...
#   DRIVE_ARGS='--voice ja-JP' .claude/kitchen/scripts/shoot-pair.sh …   # extra `drive.mjs` arguments
#
# For each flow, prints `<flow>  after=<ok|failed>  before=<ok|failed|cached>` on stdout,
# and leaves <shot>-after.png and <shot>-before.png in <out-dir>, which is what
# push-shots.sh takes. A failed flow still leaves the shots it took before the wall, and
# the script exits 1 when any After failed, after printing every line.
#
# The Before is the same screen on the same base, so it is cached by merge-base and by the
# flow file's content under .claude/tmp/shots/before-<sha>/: a later lap re-shoots the After
# alone, and pays for a worktree, install, Metro boot and drive only when the base branch
# moved or the flow changed. A changed flow drops its old Before shots first.
#
# `origin/<baseBranch>` is fetched when the clone has no such ref, as a fresh container's
# does not.
#
# The Before runs in a throwaway worktree of the merge-base, with the branch's own
# .claude scripts, session-up hooks, kitchen and flows laid over it: the base may predate them,
# and the app under shot is the only thing that should differ. The branch's checkout is never
# touched, so a dirty tree is fine and nothing needs returning to.
set -uo pipefail

out="${1:?usage: shoot-pair.sh <out-dir> <flow.yaml>...}"
shift
(($# > 0)) || { echo "usage: shoot-pair.sh <out-dir> <flow.yaml>..." >&2; exit 1; }

KITCHEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$KITCHEN" rev-parse --show-toplevel)"
TMP="$REPO_ROOT/.claude/tmp"
cd "$REPO_ROOT"

kitchen() { node "$KITCHEN/kitchen.mjs" get "$1"; }
base_branch="$(kitchen baseBranch)"
flows="$(kitchen flows)"
package_manager="$(kitchen packageManager)"
case "$package_manager" in
  npm) install=(npm ci) ;;
  *) install=("$package_manager" install --frozen-lockfile) ;;
esac

if ! git rev-parse --verify -q "refs/remotes/origin/$base_branch" >/dev/null; then
  git fetch -q origin "+refs/heads/$base_branch:refs/remotes/origin/$base_branch" >&2 ||
    { echo "cannot fetch origin/$base_branch, which the merge-base needs" >&2; exit 1; }
fi

base="$(git merge-base "origin/$base_branch" HEAD)"
before_cache="$TMP/shots/before-$base"
after_dir="$TMP/shots/after"
worktree="${TMPDIR:-/tmp}/shoot-pair-base-$base"
mkdir -p "$out" "$before_cache"
rm -rf "$after_dir"

flow_name() { basename "$1" .yaml; }
flow_hash() { git hash-object "$1"; }

before_is_cached() {
  local flow="$1" name
  name="$(flow_name "$flow")"
  [[ -f "$before_cache/$name.status" && -f "$before_cache/$name.flow" ]] &&
    [[ "$(cat "$before_cache/$name.flow")" == "$(flow_hash "$flow")" ]]
}

# shellcheck disable=SC2086
drive() {
  local root="$1" flow="$2" shots="$3"
  (cd "$root" && node .claude/kitchen/scripts/drive.mjs "$flow" --shots "$shots" --timeout 120000 ${DRIVE_ARGS:-}) >&2
}

drop_worktree() {
  git worktree prune
  [[ -d "$worktree" ]] || return 0
  (cd "$worktree" && .claude/kitchen/scripts/dev-server.sh stop) 2>/dev/null
  git worktree remove --force "$worktree" 2>/dev/null || rm -rf "$worktree"
  git worktree prune
}
trap drop_worktree EXIT

declare -A after_status before_status

"$KITCHEN/session-up.sh" up >&2 || { echo "session-up failed on the branch" >&2; exit 1; }
for flow in "$@"; do
  name="$(flow_name "$flow")"
  if drive "$REPO_ROOT" "$flow" "$after_dir/$name"; then after_status[$name]=ok; else after_status[$name]=failed; fi
done

missing=()
for flow in "$@"; do
  name="$(flow_name "$flow")"
  if before_is_cached "$flow"; then
    before_status[$name]="cached ($(cat "$before_cache/$name.status"))"
  else
    missing+=("$flow")
  fi
done

shoot_base() {
  if ! git worktree add --detach "$worktree" "$base" >&2; then
    echo "git worktree add failed for the base at $worktree" >&2
    return 1
  fi
  [[ -f "$REPO_ROOT/.env" ]] && cp "$REPO_ROOT/.env" "$worktree/.env"
  mkdir -p "$worktree/.claude/scripts" "$worktree/.claude/kitchen" "$worktree/$flows"
  [[ -d "$REPO_ROOT/.claude/scripts" ]] && cp -R "$REPO_ROOT/.claude/scripts/." "$worktree/.claude/scripts/"
  rm -rf "$worktree/.claude/session-up.d"
  [[ -d "$REPO_ROOT/.claude/session-up.d" ]] && cp -R "$REPO_ROOT/.claude/session-up.d" "$worktree/.claude/session-up.d"
  cp -R "$REPO_ROOT/.claude/kitchen/." "$worktree/.claude/kitchen/"
  cp "$REPO_ROOT/.claude/kitchen.json" "$worktree/.claude/kitchen.json"
  cp -R "$REPO_ROOT/$flows/." "$worktree/$flows/"
  (cd "$worktree" && "${install[@]}") >&2
  if ! (cd "$worktree" && .claude/kitchen/scripts/session-up.sh up) >&2; then
    echo "session-up failed on the base" >&2
    return 1
  fi
  for flow in "${missing[@]}"; do
    name="$(flow_name "$flow")"
    rm -rf "$before_cache/$name" "$before_cache/$name.status" "$before_cache/$name.flow"
    if drive "$worktree" "$flow" "$before_cache/$name"; then before_status[$name]=ok; else before_status[$name]=failed; fi
    echo "${before_status[$name]}" >"$before_cache/$name.status"
    flow_hash "$flow" >"$before_cache/$name.flow"
  done
}

if ((${#missing[@]} > 0)); then
  "$KITCHEN/dev-server.sh" stop
  drop_worktree
  shoot_base || for flow in "${missing[@]}"; do before_status[$(flow_name "$flow")]=failed; done
fi

exit_code=0
for flow in "$@"; do
  name="$(flow_name "$flow")"
  [[ "${after_status[$name]}" == ok ]] || exit_code=1
  if [[ -d "$after_dir/$name" ]]; then
    for shot in "$after_dir/$name"/*.png; do
      [[ -e "$shot" ]] && cp "$shot" "$out/$(basename "$shot" .png)-after.png"
    done
  fi
  if [[ -d "$before_cache/$name" ]]; then
    for shot in "$before_cache/$name"/*.png; do
      [[ -e "$shot" ]] && cp "$shot" "$out/$(basename "$shot" .png)-before.png"
    done
  fi
  printf '%s\tafter=%s\tbefore=%s\n' "$name" "${after_status[$name]}" "${before_status[$name]}"
done
exit "$exit_code"
