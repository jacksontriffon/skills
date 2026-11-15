# Adapters for the stack slot

`stack/<name>/<action>` is one executable per action, and `adapters.stack.use` in
[`kitchen.json`](../../../kitchen.json) names the `<name>`. The stack is the API the app talks to
and everything it needs to answer. Run an action through the dispatcher:

```
node .claude/kitchen/scripts/adapter.mjs stack up
node .claude/kitchen/scripts/adapter.mjs stack down
```

| Action | Does                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| `up`   | starts the API if it is not running, waits until it answers, and prints `API_URL=<url>` on stdout, or nothing when the app has no API |
| `down` | stops what `up` started, and says nothing when nothing is running                                     |

`up` is idempotent: a second call while the API is up prints the same line and starts nothing. It
prints only `NAME=value` lines on stdout: `API_URL=` once, if there is an API, and any other name the
app needs, which [`dev-server.sh`](../../scripts/dev-server.sh) exports to Metro. `dev-server.sh` refuses, and fails `start`, a line that
names a variable that changes how Metro runs (`PATH`, `NODE_OPTIONS`, `LD_*` and the rest of [the db README's list](../db/README.md)). It exits 1 with the
tail of its log on stderr when the API dies or does not answer in `READY_TIMEOUT` seconds (default 300).

State lives where drive.mjs and the BLOCKERS rows look for it: the URL in
`.claude/tmp/dev-server.api.url`, the log in `.claude/tmp/dev-server.log`.

[`dev-server.sh`](../../scripts/dev-server.sh) is the Expo half. It runs `up`, hands Metro the URL under
`kitchen.expo.apiUrlEnv` when there is one, and runs `down` after it stops Metro.

## trpc-next

A Next.js app that serves auth and tRPC, started with the first free port from `port`.

| Setting  | Meaning                                                                                       |
| -------- | --------------------------------------------------------------------------------------------- |
| `dir`    | the app's directory, from the repo root                                                       |
| `filter` | a turbo filter that builds the app's dependencies, then starts it once. Without one, the app's own `dev` script runs from `dir` |
| `port`   | where to start looking for a free port. 3000 if absent                                        |

A fresh container has no `.env`, so `up` copies `.env.example` when it finds none.

## none

An app with no API: an Expo app that talks to nothing of the project's own. `up` and `down` do nothing
and print nothing, so there is no `API_URL` and `kitchen.expo.apiUrlEnv` is not exported to Metro.
It writes no URL record either, so nothing reads a stale one.

## supabase-local

The local Supabase stack, started with the CLI.

| Setting  | Meaning                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------- |
| `dir`    | the directory that holds `supabase/`, from the repo root. The root if absent                         |
| `command`| how to run the CLI. `supabase` if absent; `npx supabase` or `pnpm exec supabase` for one in the project |
| `keyEnv` | a name to print the stack's publishable key under, for the app to read. Nothing is printed if absent |

`up` runs `supabase start` only when `supabase status -o env` says the stack is down, prints
`API_URL=` from that status, and records it in `.claude/tmp/dev-server.api.url`. `down` runs
`supabase stop`, which keeps the data, and does nothing when the stack is not running. Everything the
CLI says goes to stderr. The publishable key is `PUBLISHABLE_KEY` from the status, or `ANON_KEY` on a
CLI that does not print one. The `db` and `auth` adapters of the same name take the same `dir` and
`command` on their own slots.

`session-up.sh` stops the stack and starts it again on every `up`, because the other stack adapters
serve the checkout. Here that costs a cold start of the containers and nothing else: the data survives.

[`adapters-supabase.test.mjs`](../../scripts/adapters-supabase.test.mjs) runs `up` and `down` against a
shim for the CLI. What it cannot show is a real `supabase start`, which needs Docker and is slow the first
time, nor that a real `status -o env` prints the names the shim does.

[`adapters.test.mjs`](../../scripts/adapters.test.mjs) checks the shape of every directory here, and
[`adapters-stack.test.mjs`](../../scripts/adapters-stack.test.mjs) runs `trpc-next` against a shim in
place of the package manager. What it cannot show is a real Next.js build, which needs the
workspace installed: `/evidence` on a real PR is that run.
