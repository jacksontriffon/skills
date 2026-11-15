#!/usr/bin/env bash
# Vendor shared skills — and the kitchen — into a project from the repos that own them.
#
#   .claude/scripts/sync-skills.sh                          # every source at its locked commit
#   .claude/scripts/sync-skills.sh --latest                 # every source at its default ref
#   .claude/scripts/sync-skills.sh jacksontriffon/skills    # one source, at its locked commit
#   .claude/scripts/sync-skills.sh mattpocock/skills v1.3.0 # one source, at a tag/branch/commit
#   .claude/scripts/sync-skills.sh --init expo [--app DIR]  # first run in an Expo repo
#
# Only files a source has vendored before are in reach of deletion, so anything the project owns
# survives untouched.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
CLAUDE_DIR="$REPO_ROOT/.claude"
DEST="$CLAUDE_DIR/skills"
LOCK="$CLAUDE_DIR/skills.lock"
SOURCES_FILE="$CLAUDE_DIR/skills.sources"
DELTAS="$CLAUDE_DIR/skills-deltas"

KITCHEN_SOURCE="jacksontriffon/skills"
KITCHEN_REF="main"

usage() {
  sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

# ---------------------------------------------------------------------------------------------
# Arguments

LATEST=0
INIT=""
INIT_APP=""
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --latest) LATEST=1 ;;
    --init)
      INIT="${2:-}"
      [ -n "$INIT" ] || { echo "--init needs a stack: sync-skills.sh --init expo" >&2; exit 2; }
      shift
      ;;
    --init=*) INIT="${1#--init=}" ;;
    --app)
      INIT_APP="${2:-}"
      [ -n "$INIT_APP" ] || { echo "--app needs a directory" >&2; exit 2; }
      shift
      ;;
    --app=*) INIT_APP="${1#--app=}" ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "Unknown option: $1" >&2; usage; exit 2 ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done

ONLY_SOURCE="${POSITIONAL[0]:-}"
REF_OVERRIDE="${POSITIONAL[1]:-}"

if [ -n "$REF_OVERRIDE" ] && [ -z "$ONLY_SOURCE" ]; then
  echo "A ref needs a source: sync-skills.sh owner/repo [ref]" >&2
  exit 2
fi
if [ -n "$INIT" ] && [ "$INIT" != "expo" ]; then
  echo "Unknown stack '$INIT'. The only one so far is: --init expo" >&2
  exit 2
fi
if [ -n "$INIT" ] && [ -n "$ONLY_SOURCE" ]; then
  echo "--init syncs every source; it takes no source name." >&2
  exit 2
fi
if [ -n "$INIT_APP" ] && [ -z "$INIT" ]; then
  echo "--app only means something with --init." >&2
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------------------------
# Helpers

hash_file() {
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

need_node() {
  command -v node > /dev/null 2>&1 && return 0
  echo "--init needs node on PATH (it reads package.json and app.json). Install Node, then re-run." >&2
  exit 1
}

# ---------------------------------------------------------------------------------------------
# --init, part one: detect the app before anything is written, so a run that has to ask leaves
# the repo exactly as it found it.

PM=""
WORKSPACE_TOOL=""
APP_DIR=""

detect_package_manager() {
  # Decision: detect from the lockfile; pnpm when there is none.
  local found=()
  [ -f "$REPO_ROOT/pnpm-lock.yaml" ] && found+=(pnpm)
  [ -f "$REPO_ROOT/yarn.lock" ] && found+=(yarn)
  { [ -f "$REPO_ROOT/bun.lockb" ] || [ -f "$REPO_ROOT/bun.lock" ]; } && found+=(bun)
  [ -f "$REPO_ROOT/package-lock.json" ] && found+=(npm)
  if [ ${#found[@]} -eq 0 ]; then
    PM=pnpm
  else
    PM="${found[0]}"
    if [ ${#found[@]} -gt 1 ]; then
      echo "  Several lockfiles (${found[*]}); taking $PM. Delete the stale one, then fix kitchen.json." >&2
    fi
  fi
}

detect_workspace_tool() {
  if [ -f "$REPO_ROOT/turbo.json" ]; then WORKSPACE_TOOL=turbo
  elif [ -f "$REPO_ROOT/nx.json" ]; then WORKSPACE_TOOL=nx
  elif [ -f "$REPO_ROOT/lerna.json" ]; then WORKSPACE_TOOL=lerna
  elif [ -f "$REPO_ROOT/pnpm-workspace.yaml" ]; then WORKSPACE_TOOL=pnpm-workspaces
  elif [ -f "$REPO_ROOT/package.json" ] && node -e '
      const p = require(process.argv[1]);
      process.exit(p.workspaces ? 0 : 1)' "$REPO_ROOT/package.json" 2> /dev/null; then
    WORKSPACE_TOOL="$PM-workspaces"
  else
    WORKSPACE_TOOL=""
  fi
}

# Prints one repo-relative directory per line: each package whose dependencies include expo,
# looking at the root package.json and every workspace it (or pnpm-workspace.yaml) declares.
find_expo_apps() {
  node - "$REPO_ROOT" <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.argv[2];

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const hasExpo = (pkg) => !!(pkg && pkg.dependencies && pkg.dependencies.expo);

const rootPkg = readJson(path.join(root, 'package.json'));
let patterns = [];
if (rootPkg && rootPkg.workspaces) {
  patterns = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : (rootPkg.workspaces.packages || []);
}
const pnpmWs = path.join(root, 'pnpm-workspace.yaml');
if (fs.existsSync(pnpmWs)) {
  // Only the `packages:` list is read; a full YAML parser is not worth a dependency here.
  let inPackages = false;
  for (const raw of fs.readFileSync(pnpmWs, 'utf8').split('\n')) {
    const line = raw.replace(/#.*/, '');
    if (/^\S/.test(line)) { inPackages = /^packages\s*:/.test(line); continue; }
    const m = inPackages && line.match(/^\s*-\s*['"]?([^'"]+?)['"]?\s*$/);
    if (m) patterns.push(m[1]);
  }
}

const toRegex = (glob) => {
  const g = glob.replace(/^\.\//, '').replace(/\/+$/, '');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
};
const include = patterns.filter((p) => !p.startsWith('!')).map(toRegex);
const exclude = patterns.filter((p) => p.startsWith('!')).map((p) => toRegex(p.slice(1)));

const found = [];
if (hasExpo(rootPkg)) found.push('.');

const walk = (rel, depth) => {
  if (depth > 6) return;
  let entries;
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const sub = rel ? `${rel}/${e.name}` : e.name;
    if (include.some((r) => r.test(sub)) && !exclude.some((r) => r.test(sub))) {
      if (hasExpo(readJson(path.join(root, sub, 'package.json')))) found.push(sub);
    }
    walk(sub, depth + 1);
  }
};
if (include.length) walk('', 0);
console.log([...new Set(found)].sort().join('\n'));
NODE
}

ask_for_app() {
  # Decision: init asks rather than guesses. With no terminal to ask on, it stops and says how
  # to answer up front.
  local reason="$1"; shift
  local candidates=("$@")
  echo >&2
  echo "$reason" >&2
  if [ ${#candidates[@]} -gt 0 ]; then
    printf '  %s\n' "${candidates[@]}" >&2
  fi
  if ! { : < /dev/tty; } 2> /dev/null || [ -n "${SKILLS_SYNC_NO_PROMPT:-}" ]; then
    echo "Re-run with --app <dir>, the directory (relative to the repo root) of the Expo app." >&2
    exit 2
  fi
  local answer
  printf 'Which directory holds the Expo app? ' > /dev/tty
  IFS= read -r answer < /dev/tty
  [ -n "$answer" ] || { echo "No app named; nothing written." >&2; exit 2; }
  INIT_APP="$answer"
}

init_detect() {
  need_node
  detect_package_manager
  detect_workspace_tool

  if [ -z "$INIT_APP" ]; then
    local apps=()
    while IFS= read -r line; do
      [ -n "$line" ] && apps+=("$line")
    done < <(find_expo_apps)
    if [ ${#apps[@]} -eq 1 ]; then
      INIT_APP="${apps[0]}"
    elif [ ${#apps[@]} -eq 0 ]; then
      ask_for_app "No package here lists expo in its dependencies, at the root or in a workspace."
    else
      ask_for_app "More than one package lists expo in its dependencies:" "${apps[@]}"
    fi
  fi

  APP_DIR="${INIT_APP#./}"
  APP_DIR="${APP_DIR%/}"
  [ -n "$APP_DIR" ] || APP_DIR="."
  if [ ! -f "$REPO_ROOT/$APP_DIR/package.json" ]; then
    echo "No package.json at $APP_DIR — that is not a package." >&2
    exit 2
  fi

  echo "Expo app:        $APP_DIR"
  echo "Package manager: $PM"
  echo "Workspace tool:  ${WORKSPACE_TOOL:-none}"
  echo

  if [ ! -f "$SOURCES_FILE" ]; then
    mkdir -p "$CLAUDE_DIR"
    cat > "$SOURCES_FILE" <<EOF
# owner/repo | default ref | dirs | type (skills when omitted)
# Written by sync-skills.sh --init. Yours to edit from here on.
$KITCHEN_SOURCE|$KITCHEN_REF|skills
$KITCHEN_SOURCE|$KITCHEN_REF|kitchen|kitchen
EOF
    echo "Wrote .claude/skills.sources."
  else
    echo "Kept .claude/skills.sources — it already exists."
    if ! grep -Eq '^[^#]*\|[^|]*\|[^|]*\|[[:space:]]*kitchen[[:space:]]*$' "$SOURCES_FILE"; then
      echo "  It names no kitchen source. Add: $KITCHEN_SOURCE|$KITCHEN_REF|kitchen|kitchen" >&2
      exit 1
    fi
  fi
  echo
}

[ -z "$INIT" ] || init_detect

# ---------------------------------------------------------------------------------------------
# Sync

# owner/repo | default ref | space-separated dirs | type
#   skills  — each dir holds one subdirectory per skill (the default, and the only type before)
#   kitchen — dirs is the kitchen root (default `kitchen`); each part lands where the project
#             expects it, file by file, and the lock names every file
SOURCES=()
if [ -f "$SOURCES_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    [ -n "${line// /}" ] || continue
    SOURCES+=("$line")
  done < "$SOURCES_FILE"
else
  SOURCES=("$KITCHEN_SOURCE|$KITCHEN_REF|skills")
fi

mkdir -p "$DEST"

# Two row shapes share the lock, told apart by the first column:
#   skill<TAB>source<TAB>ref<TAB>sha<TAB>date                — a skills source; a bare name
#   path<TAB>source<TAB>ref<TAB>sha<TAB>date<TAB>sha256      — a kitchen source; a repo path,
#                                                             so it always holds a slash
NEW_LOCK="$TMP/lock"
OLD_LOCK="$TMP/lock.old"
if [ -f "$LOCK" ]; then
  grep -v '^#' "$LOCK" > "$NEW_LOCK" || true
else
  : > "$NEW_LOCK"
fi
cp "$NEW_LOCK" "$OLD_LOCK"

# awk filters for the two shapes
SKILL_ROW='$1 !~ /\//'
FILE_ROW='$1 ~ /\//'

apply_deltas() {
  # Hand-edits to a vendored file are lost on the next sync, so anything the project needs
  # changed in a file it does not own lives as a patch under .claude/skills-deltas/<source>/
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

# clone_source <source> <want> → sets $src. One clone per source and commit, so a repo listed
# twice (portable skills + kitchen) is fetched once.
clone_source() {
  local source="$1" want="$2"
  src="$TMP/clones/${source//\//_}@${want//\//_}"
  [ -d "$src/.git" ] && return 0
  mkdir -p "$TMP/clones"
  echo "Cloning $source @ $want..."
  if ! git clone --quiet --depth 1 --branch "$want" "https://github.com/$source.git" "$src" 2> /dev/null; then
    rm -rf "$src"
    if ! git clone --quiet "https://github.com/$source.git" "$src" 2> /dev/null; then
      echo "  FAILED: cannot reach https://github.com/$source at $want" >&2
      echo "  Check the name, the ref, and that this machine can read the repo." >&2
      exit 1
    fi
    git -C "$src" checkout --quiet "$want"
  fi
}

sync_skills_entry() {
  local source="$1" subdirs="$2"

  # A source that drops a skill has to drop its lock row too, or the lockfile keeps naming a
  # directory the sync no longer writes and nobody can tell the record from the tree.
  local had
  had="$(awk -F'\t' -v s="$source" "$SKILL_ROW"' && $2 == s { print $1 }' "$OLD_LOCK")"
  awk -F'\t' -v s="$source" '!('"$SKILL_ROW"' && $2 == s)' "$NEW_LOCK" > "$TMP/keep" && mv "$TMP/keep" "$NEW_LOCK"

  local subdir dir name owner
  for subdir in $subdirs; do
    [ -d "$src/$subdir" ] || continue
    for dir in "$src/$subdir"/*/; do
      [ -f "$dir/SKILL.md" ] || continue
      name="$(basename "$dir")"

      owner="$(awk -v n="$name" -F'\t' "$SKILL_ROW"' && $1 == n { print $2 }' "$NEW_LOCK")"
      if [ -n "$owner" ] && [ "$owner" != "$source" ]; then
        echo "  FAILED: $source and $owner both ship a skill named '$name'" >&2
        exit 1
      fi
      if grep -q "^\.claude/skills/$name/" "$NEW_LOCK"; then
        echo "  FAILED: $source ships a skill named '$name', and a kitchen source already does" >&2
        exit 1
      fi

      rm -rf "${DEST:?}/$name"
      cp -r "$dir" "$DEST/$name"
      printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$source" "$ref" "$sha" "$date" >> "$NEW_LOCK"
      echo "  $name"
    done
  done

  # The row is gone but the directory is not: a dropped skill keeps loading, sourceless, until
  # something deletes it. Only names this source owned last run are candidates, so a skill the
  # project owns — which has no lock row at all — is never in reach.
  for name in $had; do
    awk -F'\t' -v n="$name" -v s="$source" "$SKILL_ROW"' && $1 == n && $2 == s { found = 1 } END { exit !found }' "$NEW_LOCK" && continue
    rm -rf "${DEST:?}/$name"
    echo "  removed $name — no longer upstream"
  done
}

# kitchen_manifest <kitchen root in clone> → "<from>\t<to>" per file, to relative to the repo.
# This is the layout contract; templates/ is deliberately absent — only --init reads it.
kitchen_manifest() {
  local k="$1" f rel name
  if [ -d "$k/skills" ]; then
    for dir in "$k/skills"/*/; do
      [ -f "$dir/SKILL.md" ] || continue
      name="$(basename "$dir")"
      ( cd "$dir" && find . -type f ! -name '.DS_Store' | sed 's|^\./||' | LC_ALL=C sort ) | while IFS= read -r rel; do
        printf '%s\t%s\n' "skills/$name/$rel" ".claude/skills/$name/$rel"
      done
    done
  fi
  if [ -d "$k/agents" ]; then
    for f in "$k/agents"/*.md; do
      [ -f "$f" ] || continue
      printf '%s\t%s\n' "agents/$(basename "$f")" ".claude/agents/$(basename "$f")"
    done
  fi
  local part
  for part in scripts adapters docs; do
    [ -d "$k/$part" ] || continue
    ( cd "$k/$part" && find . -type f ! -name '.DS_Store' | sed 's|^\./||' | LC_ALL=C sort ) | while IFS= read -r rel; do
      printf '%s\t%s\n' "$part/$rel" ".claude/kitchen/$part/$rel"
    done
  done
  [ -f "$k/kitchen.schema.json" ] && printf '%s\t%s\n' "kitchen.schema.json" ".claude/kitchen/kitchen.schema.json"
  if [ -d "$k/workflows" ]; then
    for f in "$k/workflows"/*.yml; do
      [ -f "$f" ] || continue
      name="$(basename "$f" .yml)"
      printf '%s\t%s\n' "workflows/$name.yml" ".github/workflows/kitchen-$name.yml"
    done
  fi
  return 0
}

KITCHEN_CLONE=""

sync_kitchen_entry() {
  local source="$1" root="${2:-kitchen}"
  root="${root%% *}"
  local k="$src/$root"
  if [ ! -d "$k" ]; then
    echo "  FAILED: $source has no '$root/' directory at $sha" >&2
    exit 1
  fi
  KITCHEN_CLONE="$k"

  local manifest="$TMP/manifest"
  kitchen_manifest "$k" > "$manifest"

  # Everything this source owned last run, by path and the hash it shipped.
  local owned="$TMP/owned"
  awk -F'\t' -v s="$source" "$FILE_ROW"' && $2 == s { print $1 "\t" $6 }' "$OLD_LOCK" > "$owned"

  # Check before writing anything: a file in the way that the lock does not own is the
  # project's. Identical bytes are adopted (that is the eng-video dogfood case); anything else
  # stops the run, because overwriting it would be reaching a project file.
  local from to conflicts=0 other
  while IFS=$'\t' read -r from to; do
    other="$(awk -F'\t' -v p="$to" -v s="$source" '$1 == p && $2 != s { print $2; exit }' "$NEW_LOCK")"
    if [ -n "$other" ]; then
      echo "  FAILED: $source and $other both ship $to" >&2
      conflicts=1
      continue
    fi
    case "$to" in
      .claude/skills/*)
        name="${to#.claude/skills/}"; name="${name%%/*}"
        other="$(awk -F'\t' -v n="$name" "$SKILL_ROW"' && $1 == n { print $2; exit }' "$NEW_LOCK")"
        if [ -n "$other" ]; then
          echo "  FAILED: $source (kitchen) and $other both ship a skill named '$name'" >&2
          conflicts=1
          continue
        fi
        ;;
    esac
    [ -e "$REPO_ROOT/$to" ] || continue
    awk -F'\t' -v p="$to" '$1 == p { found = 1 } END { exit !found }' "$owned" && continue
    if [ "$(hash_file "$REPO_ROOT/$to")" != "$(hash_file "$k/$from")" ]; then
      echo "  FAILED: $to exists and the lock does not own it — the project's file, not the kitchen's." >&2
      conflicts=1
    fi
  done < "$manifest"
  if [ "$conflicts" = 1 ]; then
    echo "  Nothing was written. Move or delete those files (or rename the project's), then re-run." >&2
    exit 1
  fi

  awk -F'\t' -v s="$source" '!('"$FILE_ROW"' && $2 == s)' "$NEW_LOCK" > "$TMP/keep" && mv "$TMP/keep" "$NEW_LOCK"

  local n=0 hash
  while IFS=$'\t' read -r from to; do
    mkdir -p "$(dirname "$REPO_ROOT/$to")"
    rm -f "$REPO_ROOT/$to"
    cp "$k/$from" "$REPO_ROOT/$to"
    hash="$(hash_file "$k/$from")"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$to" "$source" "$ref" "$sha" "$date" "$hash" >> "$NEW_LOCK"
    n=$((n + 1))
  done < "$manifest"
  echo "  $n kitchen files"
  cut -f2 "$manifest" | awk -F/ '
    /^\.claude\/skills\// { s[$3] = 1 }
    END { for (k in s) n++; if (n) printf "  %d kitchen skills\n", n }'

  # Delete only what the lock owned and the source dropped. A path with no lock row — every
  # file the project wrote itself — is never a candidate.
  local path oldhash
  while IFS=$'\t' read -r path oldhash; do
    [ -n "$path" ] || continue
    awk -F'\t' -v p="$path" '$2 == p { found = 1 } END { exit !found }' "$manifest" && continue
    if [ -e "$REPO_ROOT/$path" ]; then
      if [ "$(hash_file "$REPO_ROOT/$path")" != "$oldhash" ]; then
        echo "  removed $path — no longer upstream (it carried local edits; see git diff)"
      else
        echo "  removed $path — no longer upstream"
      fi
      rm -f "$REPO_ROOT/$path"
    fi
    # Tidy directories the removal emptied, stopping at the roots the kitchen writes into.
    local d
    d="$(dirname "$path")"
    while [ "$d" != "." ] && [ "$d" != ".claude" ] && [ "$d" != ".claude/kitchen" ] \
      && [ "$d" != ".claude/skills" ] && [ "$d" != ".claude/agents" ] \
      && [ "$d" != ".github" ] && [ "$d" != ".github/workflows" ]; do
      rmdir "$REPO_ROOT/$d" 2> /dev/null || break
      d="$(dirname "$d")"
    done
  done < "$owned"
}

synced_any=0
SYNCED_SOURCES=()

for entry in "${SOURCES[@]}"; do
  IFS='|' read -r source default_ref subdirs type <<< "$entry"
  source="$(echo "$source" | xargs)"
  default_ref="$(echo "$default_ref" | xargs)"
  type="$(echo "${type:-skills}" | xargs)"
  [ -z "$ONLY_SOURCE" ] || [ "$ONLY_SOURCE" = "$source" ] || continue
  synced_any=1

  case "$type" in
    skills) row="$SKILL_ROW" ;;
    kitchen) row="$FILE_ROW" ;;
    *) echo "  FAILED: unknown source type '$type' for $source (skills or kitchen)" >&2; exit 1 ;;
  esac

  # A lockfile nobody reads pins nothing: with no ref asked for, take the commit already
  # locked so a bare run reproduces the tree rather than silently walking upstream forward.
  locked_ref="$(awk -F'\t' -v s="$source" "$row"' && $2 == s { print $3; exit }' "$OLD_LOCK")"
  locked_sha="$(awk -F'\t' -v s="$source" "$row"' && $2 == s { print $4; exit }' "$OLD_LOCK")"

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

  clone_source "$source" "$want"
  sha="$(git -C "$src" rev-parse HEAD)"
  date="$(git -C "$src" log -1 --format=%cd --date=short)"

  if [ "$type" = kitchen ]; then
    sync_kitchen_entry "$source" "$subdirs"
  else
    sync_skills_entry "$source" "$subdirs"
  fi

  case " ${SYNCED_SOURCES[*]-} " in
    *" $source "*) ;;
    *) SYNCED_SOURCES+=("$source") ;;
  esac
  echo "Synced $source ($type) to $sha ($date)."
  echo
done

if [ "$synced_any" = 0 ]; then
  echo "No source matches '$ONLY_SOURCE'. Known sources:" >&2
  printf '  %s\n' "${SOURCES[@]%%|*}" >&2
  exit 2
fi

# Deltas go on once per source, after every entry from it has landed, so a source listed for
# both its skills and its kitchen does not have its patches applied twice.
for source in "${SYNCED_SOURCES[@]}"; do
  if [ -d "$DELTAS/${source//\//_}" ]; then
    echo "Re-applying local deltas for $source..."
    apply_deltas "$source"
    echo
  fi
done

{
  echo "# Written by sync-skills.sh — do not hand-edit."
  echo "# skill<TAB>source<TAB>ref<TAB>sha<TAB>date"
  if grep -q '/' <(cut -f1 "$NEW_LOCK"); then
    echo "# path<TAB>source<TAB>ref<TAB>sha<TAB>date<TAB>sha256   (kitchen files)"
  fi
  LC_ALL=C sort -u -k1,1 -t"$(printf '\t')" "$NEW_LOCK"
} > "$LOCK"

echo "Wrote $(basename "$LOCK")."

# ---------------------------------------------------------------------------------------------
# --init, part two: the starter files. Each is written once and never overwritten; the merges
# (package.json scripts, settings.json, the CLAUDE.md section) only ever add what is missing.

init_write_starters() {
  local templates="$KITCHEN_CLONE/templates/expo"
  if [ -z "$KITCHEN_CLONE" ] || [ ! -d "$templates" ]; then
    echo "  FAILED: the kitchen source has no templates/expo/ — nothing to start from." >&2
    exit 1
  fi
  echo
  echo "Starter files (written once, never overwritten):"
  node - "$REPO_ROOT" "$templates" "$APP_DIR" "$PM" "$WORKSPACE_TOOL" <<'NODE'
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [root, templates, appDir, pm, workspaceTool] = process.argv.slice(2);

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const rel = (...p) => path.posix.join(...p).replace(/^\.\//, '') || '.';
const app = (p) => (appDir === '.' ? p : `${appDir}/${p}`);
const exists = (p) => fs.existsSync(path.join(root, p));
const git = (...args) => { try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

// --- What init can learn without a Claude session --------------------------------------------
let appJson = readJson(path.join(root, appDir, 'app.json'));
let expo = (appJson && (appJson.expo || appJson)) || {};
let appId = (expo.ios && expo.ios.bundleIdentifier) || (expo.android && expo.android.package) || null;
let scheme = Array.isArray(expo.scheme) ? expo.scheme[0] : expo.scheme || null;
if (!appJson) {
  // app.config.{ts,js} can only be evaluated with the project's dependencies installed, so the
  // literal values are read off the text instead. Anything computed is left for /kitchen-setup.
  for (const f of ['app.config.ts', 'app.config.js', 'app.config.mjs', 'app.config.cjs']) {
    const p = path.join(root, appDir, f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    const lit = (key) => { const m = src.match(new RegExp(`\\b${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`)); return m ? m[1] : null; };
    appId = lit('bundleIdentifier') || lit('package');
    scheme = lit('scheme');
    break;
  }
}
const routesDir = ['src/app', 'app'].map(app).find(exists) || app('app');
const remote = git('remote', 'get-url', 'origin');
const repoMatch = remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
const head = git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '');
const baseBranch = head || git('symbolic-ref', '--short', 'HEAD') || 'main';

const values = {
  // The schema requires repo as owner/name, so an undetected one is a placeholder that still
  // validates; doctor and /kitchen-setup name it.
  REPO: repoMatch ? repoMatch[1] : 'TODO-owner/TODO-repo',
  BASE_BRANCH: baseBranch,
  PACKAGE_MANAGER: pm,
  WORKSPACE_TOOL: workspaceTool || null,
  APP_DIR: appDir,
  ROUTES_DIR: routesDir,
  APP_ID: appId,
  SCHEME: scheme,
  NATIVE_DIRS: [app('ios'), app('android')],
  // A GitHub login init cannot know; /kitchen-setup asks for the humans per area.
  HUMAN: 'TODO-github-login',
};
// In prose and YAML a missing value still has to read as something to fill in.
const textValue = (k) => {
  const v = values[k];
  if (v === null || v === undefined) return `TODO-${k.toLowerCase().replace(/_/g, '-')}`;
  return Array.isArray(v) ? v.join(', ') : String(v);
};
const renderText = (s) => s.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in values ? textValue(k) : m));
// In JSON a value that is exactly "{{KEY}}" takes the value's own type, and a key whose value
// init could not find is left out, so the schema's default or /kitchen-setup supplies it.
const renderJson = (node) => {
  if (Array.isArray(node)) return node.map(renderJson).filter((v) => v !== undefined);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      const r = renderJson(v);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  if (typeof node === 'string') {
    const whole = node.match(/^\{\{([A-Z_]+)\}\}$/);
    if (whole && whole[1] in values) {
      const v = values[whole[1]];
      return v === null || v === undefined ? undefined : v;
    }
    return renderText(node);
  }
  return node;
};

const report = (verb, p) => console.log(`  ${verb.padEnd(7)} ${p}`);
const indentOf = (text) => { const m = text.match(/^[ \t]+(?=")/m); return m ? m[0] : '  '; };
const writeJson = (p, obj, like) => {
  const text = JSON.stringify(obj, null, like ? indentOf(like) : 2) + '\n';
  fs.writeFileSync(path.join(root, p), text);
};

// --- 1. Plain files: templates/expo/files/** → the same path in the repo --------------------
const filesDir = path.join(templates, 'files');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full) : [full];
});
for (const full of fs.existsSync(filesDir) ? walk(filesDir).sort() : []) {
  const target = path.relative(filesDir, full).split(path.sep).join('/');
  if (exists(target)) { report('kept', target); continue; }
  fs.mkdirSync(path.dirname(path.join(root, target)), { recursive: true });
  const raw = fs.readFileSync(full);
  // Copied byte for byte when there is nothing to fill in, so an empty file stays zero bytes.
  const text = raw.toString('utf8');
  if (target.endsWith('.json')) {
    writeJson(target, renderJson(JSON.parse(text)));
  } else {
    fs.writeFileSync(path.join(root, target), /\{\{[A-Z_]+\}\}/.test(text) ? renderText(text) : raw);
  }
  report('wrote', target);
}

// --- 2. .claude/settings.json: written whole, or the missing pieces added -------------------
{
  const target = '.claude/settings.json';
  const want = renderJson(JSON.parse(fs.readFileSync(path.join(templates, 'settings.json'), 'utf8')));
  if (!exists(target)) {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeJson(target, want);
    report('wrote', target);
  } else {
    const before = fs.readFileSync(path.join(root, target), 'utf8');
    const have = JSON.parse(before);
    let added = false;
    const allow = (want.permissions && want.permissions.allow) || [];
    have.permissions = have.permissions || {};
    have.permissions.allow = have.permissions.allow || [];
    for (const rule of allow) if (!have.permissions.allow.includes(rule)) { have.permissions.allow.push(rule); added = true; }
    for (const [event, groups] of Object.entries(want.hooks || {})) {
      have.hooks = have.hooks || {};
      have.hooks[event] = have.hooks[event] || [];
      const commands = new Set(have.hooks[event].flatMap((g) => (g.hooks || []).map((h) => h.command)));
      for (const g of groups) {
        if ((g.hooks || []).every((h) => commands.has(h.command))) continue;
        have.hooks[event].push(g);
        added = true;
      }
    }
    if (added) { writeJson(target, have, before); report('added', `${target} (missing permissions/hooks only)`); }
    else report('kept', target);
  }
}

// --- 3. CLAUDE.md: the kitchen section, once, between markers --------------------------------
{
  const target = 'CLAUDE.md';
  const section = renderText(fs.readFileSync(path.join(templates, 'CLAUDE.section.md'), 'utf8')).replace(/\n*$/, '\n');
  const marker = section.split('\n')[0];
  if (!exists(target)) {
    fs.writeFileSync(path.join(root, target), section);
    report('wrote', target);
  } else {
    const have = fs.readFileSync(path.join(root, target), 'utf8');
    if (have.includes(marker)) report('kept', target);
    else {
      fs.writeFileSync(path.join(root, target), have.replace(/\n*$/, '\n\n') + section);
      report('added', `${target} (kitchen section)`);
    }
  }
}

// --- 4. package.json scripts at the repo root: added when the name is free -------------------
{
  const target = 'package.json';
  const want = JSON.parse(fs.readFileSync(path.join(templates, 'package-scripts.json'), 'utf8'));
  const before = exists(target) ? fs.readFileSync(path.join(root, target), 'utf8') : null;
  const pkg = before ? JSON.parse(before) : { private: true };
  pkg.scripts = pkg.scripts || {};
  const added = [];
  const clashed = [];
  for (const [name, cmd] of Object.entries(want)) {
    if (!(name in pkg.scripts)) { pkg.scripts[name] = cmd; added.push(name); }
    else if (pkg.scripts[name] !== cmd) clashed.push(name);
  }
  if (added.length) { writeJson(target, pkg, before); report('added', `${target} scripts: ${added.join(', ')}`); }
  else report('kept', `${target} scripts`);
  for (const name of clashed) console.log(`  NOTE    ${target} already has a "${name}" script; kept yours. The kitchen expects: ${want[name]}`);
}
NODE
}

if [ -n "$INIT" ]; then
  init_write_starters
  echo
  echo "Next: open a Claude session here and run /kitchen-setup, then '$PM kitchen:doctor'."
fi

echo "Review 'git diff' before committing."
