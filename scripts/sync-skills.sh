#!/usr/bin/env bash
# Vendor shared skills into a project's .claude/skills/ from the repos that own them.
#
#   .claude/scripts/sync-skills.sh                          # every source at its locked commit
#   .claude/scripts/sync-skills.sh --latest                 # every source at its default ref
#   .claude/scripts/sync-skills.sh jacksontriffon/skills    # one source, at its locked commit
#   .claude/scripts/sync-skills.sh mattpocock/skills v1.3.0 # one source, at a tag/branch/commit
#
# Only skills that exist upstream are touched, so skills the project owns survive untouched.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
DEST="$REPO_ROOT/.claude/skills"
LOCK="$REPO_ROOT/.claude/skills.lock"
SOURCES_FILE="$REPO_ROOT/.claude/skills.sources"
DELTAS="$REPO_ROOT/.claude/skills-deltas"

# owner/repo | default ref | space-separated directories holding one subdirectory per skill
SOURCES=()
if [ -f "$SOURCES_FILE" ]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    [ -n "${line// /}" ] || continue
    SOURCES+=("$line")
  done < "$SOURCES_FILE"
else
  SOURCES=("jacksontriffon/skills|main|skills")
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

LATEST=0
if [ "${1:-}" = "--latest" ]; then
  LATEST=1
  shift
fi

ONLY_SOURCE="${1:-}"
REF_OVERRIDE="${2:-}"

if [ -n "$REF_OVERRIDE" ] && [ -z "$ONLY_SOURCE" ]; then
  echo "A ref needs a source: sync-skills.sh owner/repo [ref]" >&2
  exit 2
fi

mkdir -p "$DEST"

# skill<TAB>source<TAB>ref<TAB>sha<TAB>date, one line per vendored skill.
NEW_LOCK="$TMP/lock"
OLD_LOCK="$TMP/lock.old"
if [ -f "$LOCK" ]; then
  grep -v '^#' "$LOCK" > "$NEW_LOCK" || true
else
  : > "$NEW_LOCK"
fi
cp "$NEW_LOCK" "$OLD_LOCK"

apply_deltas() {
  # Hand-edits to a vendored skill are lost on the next sync, so anything the project needs
  # changed in a skill it does not own lives as a patch under .claude/skills-deltas/<source>/
  # and is re-applied here. A patch that stops applying fails the run rather than reverting
  # silently.
  local source="$1"
  local dir="$DELTAS/${source//\//_}"
  [ -d "$dir" ] || return 0

  local patch
  for patch in "$dir"/*.patch; do
    [ -f "$patch" ] || continue
    if git -C "$REPO_ROOT" apply --whitespace=nowarn "$patch"; then
      echo "  $(basename "$patch" .patch)"
    else
      echo "  FAILED: $(basename "$patch") no longer applies — upstream moved under it." >&2
      echo "  Re-cut it against the new upstream, then re-run." >&2
      exit 1
    fi
  done
}

synced_any=0

for entry in "${SOURCES[@]}"; do
  IFS='|' read -r source default_ref subdirs <<< "$entry"
  [ -z "$ONLY_SOURCE" ] || [ "$ONLY_SOURCE" = "$source" ] || continue
  synced_any=1

  # A lockfile nobody reads pins nothing: with no ref asked for, take the commit already
  # locked so a bare run reproduces the tree rather than silently walking upstream forward.
  locked_ref="$(awk -F'\t' -v s="$source" '$2 == s { print $3; exit }' "$OLD_LOCK")"
  locked_sha="$(awk -F'\t' -v s="$source" '$2 == s { print $4; exit }' "$OLD_LOCK")"

  if [ -n "$REF_OVERRIDE" ]; then
    ref="$REF_OVERRIDE"
    want="$REF_OVERRIDE"
  elif [ "$LATEST" = 1 ] || [ -z "$locked_sha" ]; then
    ref="$default_ref"
    want="$default_ref"
  else
    ref="${locked_ref:-$default_ref}"
    want="$locked_sha"
  fi
  src="$TMP/${source//\//_}"

  echo "Cloning $source @ $want..."
  if ! git clone --quiet --depth 1 --branch "$want" "https://github.com/$source.git" "$src" 2>/dev/null; then
    if ! git clone --quiet "https://github.com/$source.git" "$src" 2>/dev/null; then
      echo "  FAILED: cannot reach https://github.com/$source at $want" >&2
      echo "  Check the name, the ref, and that this machine can read the repo." >&2
      exit 1
    fi
    git -C "$src" checkout --quiet "$want"
  fi

  sha="$(git -C "$src" rev-parse HEAD)"
  date="$(git -C "$src" log -1 --format=%cd --date=short)"

  # A source that drops a skill has to drop its lock row too, or the lockfile keeps naming a
  # directory the sync no longer writes and nobody can tell the record from the tree.
  awk -F'\t' -v s="$source" '$2 != s' "$NEW_LOCK" > "$TMP/keep" && mv "$TMP/keep" "$NEW_LOCK"

  for subdir in $subdirs; do
    [ -d "$src/$subdir" ] || continue
    for dir in "$src/$subdir"/*/; do
      [ -f "$dir/SKILL.md" ] || continue
      name="$(basename "$dir")"

      owner="$(awk -v n="$name" -F'\t' '$1 == n { print $2 }' "$NEW_LOCK")"
      if [ -n "$owner" ] && [ "$owner" != "$source" ]; then
        echo "  FAILED: $source and $owner both ship a skill named '$name'" >&2
        exit 1
      fi

      rm -rf "${DEST:?}/$name"
      cp -r "$dir" "$DEST/$name"
      printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$source" "$ref" "$sha" "$date" >> "$NEW_LOCK"
      echo "  $name"
    done
  done

  echo
  echo "Re-applying local deltas..."
  apply_deltas "$source"
  echo
  echo "Synced $source to $sha ($date)."
  echo
done

if [ "$synced_any" = 0 ]; then
  echo "No source matches '$ONLY_SOURCE'. Known sources:" >&2
  printf '  %s\n' "${SOURCES[@]%%|*}" >&2
  exit 2
fi

{
  echo "# Written by sync-skills.sh — do not hand-edit."
  echo "# skill<TAB>source<TAB>ref<TAB>sha<TAB>date"
  sort -u -k1,1 -t"$(printf '\t')" "$NEW_LOCK"
} > "$LOCK"

echo "Wrote $(basename "$LOCK"). Review 'git diff' before committing."
