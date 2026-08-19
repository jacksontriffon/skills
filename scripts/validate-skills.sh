#!/usr/bin/env bash
# Fail the build on a skill Claude Code would silently refuse to load.
#
# A SKILL.md with broken frontmatter does not error at startup — the skill is simply absent, and
# the first anyone hears of it is a slash command that does nothing. So the shape is checked here.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
failed=0

fail() {
  echo "  $1" >&2
  failed=1
}

shopt -s nullglob
dirs=("$ROOT"/skills/*/)

if [ ${#dirs[@]} -eq 0 ]; then
  echo "No skills found under skills/." >&2
  exit 1
fi

for dir in "${dirs[@]}"; do
  name="$(basename "$dir")"
  echo "$name"

  case "$name" in
    *[!a-z0-9-]*) fail "directory name must be lower-case kebab: '$name'" ;;
  esac

  file="$dir/SKILL.md"
  if [ ! -f "$file" ]; then
    fail "no SKILL.md"
    continue
  fi

  if [ "$(head -n 1 "$file")" != "---" ]; then
    fail "SKILL.md must open with '---' on line 1"
    continue
  fi

  close="$(awk 'NR > 1 && $0 == "---" { print NR; exit }' "$file")"
  if [ -z "$close" ]; then
    fail "frontmatter is never closed with '---'"
    continue
  fi

  front="$(sed -n "2,$((close - 1))p" "$file")"

  declared="$(printf '%s\n' "$front" | awk -F': *' '/^name:/ { print $2; exit }')"
  if [ -z "$declared" ]; then
    fail "frontmatter has no 'name'"
  elif [ "$declared" != "$name" ]; then
    fail "frontmatter name '$declared' does not match directory '$name'"
  fi

  if ! printf '%s\n' "$front" | grep -q '^description:'; then
    fail "frontmatter has no 'description' — without one the skill never triggers"
  fi
done

if [ "$failed" = 1 ]; then
  echo >&2
  echo "Invalid skills above." >&2
  exit 1
fi

echo
echo "${#dirs[@]} skills valid."
