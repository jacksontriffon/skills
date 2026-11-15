# shellcheck shell=bash disable=SC2034
# Sourced by the adapters that are shell scripts. The dispatcher hands an adapter its slot's
# settings in KITCHEN_ADAPTER; without it an adapter has no repo root and no settings to read.

if [[ -z "${KITCHEN_ADAPTER:-}" ]]; then
  echo "run this through .claude/kitchen/scripts/adapter.mjs, which hands it kitchen.json's settings" >&2
  exit 1
fi

# setting <dotted.path> [default] — a value from the slot's settings, or from the dispatcher's own keys.
setting() {
  node -e '
    const value = process.argv[1].split(".").reduce((node, key) => node?.[key], JSON.parse(process.env.KITCHEN_ADAPTER));
    process.stdout.write(value === undefined || value === null ? (process.argv[2] ?? "") : String(value));
  ' "$1" "${2:-}"
}

REPO_ROOT="$(setting root)"
REPO_ROOT="${REPO_ROOT%/}"
PACKAGE_MANAGER="$(setting packageManager pnpm)"
STATE_DIR="$REPO_ROOT/.claude/tmp"

# The package manager's own way to run a binary from the project's dependencies. npm reads the
# flags after the command as its own unless `--` stands between, and bun's runner is bunx.
case "$PACKAGE_MANAGER" in
  npm) PM_EXEC=(npm exec --) ;;
  bun) PM_EXEC=(bunx) ;;
  *) PM_EXEC=("$PACKAGE_MANAGER" exec) ;;
esac

# Replaces KEY if .env has it, appends it if not, so a second run never doubles a line.
set_env() {
  local key="$1" value="$2" file="$REPO_ROOT/.env"
  if [[ ! -f "$file" ]]; then
    if [[ -f "$REPO_ROOT/.env.example" ]]; then
      cp "$REPO_ROOT/.env.example" "$file"
      echo "no .env; copied .env.example" >&2
    else
      : >"$file"
    fi
  fi
  if grep -q "^$key=" "$file"; then
    sed -i "s|^$key=.*|$key='$value'|" "$file"
  else
    echo "$key='$value'" >>"$file"
  fi
}
