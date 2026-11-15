#!/bin/sh
# Host a PR's shots and print the URL of each: `push-shots.sh <pr> <dir>`. The host is
# kitchen.json's adapters.evidenceHost; the workflows and docs name this script rather than one.
exec node "$(dirname "$0")/adapter.mjs" evidenceHost push "$@"
