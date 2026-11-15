#!/usr/bin/env bash
# Install the project's dependencies through the package manager kitchen.json names, on a
# runner or in a fresh container.
#
#   .claude/kitchen/scripts/install.sh
#
# Corepack provides pnpm and yarn at the version package.json's `packageManager` pins. The
# lockfile is honoured when there is one; with none, the install writes it.
# KITCHEN_INSTALL_DRY=1 prints the commands instead of running them, for the test.
set -euo pipefail

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPTS" rev-parse --show-toplevel)"
pm="$(node "$SCRIPTS/kitchen.mjs" get packageManager)"

run() {
  if [[ "${KITCHEN_INSTALL_DRY:-}" == 1 ]]; then
    echo "$*"
  else
    "$@"
  fi
}

cd "$REPO_ROOT"
case "$pm" in
  pnpm)
    command -v pnpm >/dev/null 2>&1 || run corepack enable pnpm
    if [[ -f pnpm-lock.yaml ]]; then run pnpm install --frozen-lockfile; else run pnpm install; fi
    ;;
  yarn)
    command -v yarn >/dev/null 2>&1 || run corepack enable yarn
    frozen=--immutable
    [[ "${KITCHEN_YARN_VERSION:-$(yarn --version 2>/dev/null || echo 4)}" == 1.* ]] && frozen=--frozen-lockfile
    if [[ -f yarn.lock ]]; then run yarn install "$frozen"; else run yarn install; fi
    ;;
  bun)
    command -v bun >/dev/null 2>&1 || run npm install --global bun
    if [[ -f bun.lock || -f bun.lockb ]]; then run bun install --frozen-lockfile; else run bun install; fi
    ;;
  npm)
    if [[ -f package-lock.json ]]; then run npm ci; else run npm install; fi
    ;;
  *)
    echo "packageManager is $pm, which install.sh cannot run" >&2
    exit 1
    ;;
esac
