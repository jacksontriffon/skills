# shellcheck shell=bash
# Sourced by session-up.sh and dev-server.sh, the two places that turn an adapter's or a hook's
# stdout into environment for what runs next.

# A name an adapter or hook may not set: read-only in bash, or one that changes how every later
# command runs, so a stray line would hijack the steps after it.
env_name_refused() {
  case "$1" in
    PATH | BASH_ENV | ENV | NODE_OPTIONS | IFS | SHELL | HOME | UID | EUID | PPID | SHELLOPTS | BASHOPTS | LD_* | DYLD_*) return 0 ;;
  esac
  return 1
}

# env_assignment <source> <line> — succeeds when the line is a NAME=value to pass on. A line that is
# not one is output of some other kind and is skipped. A refused name prints which source set it and
# which line, and fails.
env_assignment() {
  local source="$1" line="$2"
  [[ "$line" =~ ^[A-Z][A-Z0-9_]*= ]] || return 2
  if env_name_refused "${line%%=*}"; then
    echo "refusing $source: it printed \`$line\`, and ${line%%=*} changes how every later command runs" >&2
    return 1
  fi
  return 0
}
