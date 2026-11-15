# Blockers every project meets

One row a blocker: what you see, what it is, what to run. Do the steps, re-run the step that
failed, carry on.

These are the rows any Expo repo on the kitchen meets — Metro, Expo web, Playwright, GitHub and
the loop's own mechanics. A project's own rows are in its [`BLOCKERS.md`](../../BLOCKERS.md).
Search both the moment a command fails —
`grep -n -i '<words from the error>' .claude/BLOCKERS.md .claude/kitchen/docs/BLOCKERS.core.md`
— rather than reading either whole: a row is one line and carries its fix. No row →
[look it up yourself](#look-it-up-yourself) and fix it. `blocked` is for what that could not fix — [what that posts](#a-blocker-with-no-row).

## Look it up yourself

No row below? The connectors show what broke. Read before guessing; fix before asking. The
project's own connectors are in [its section](../../BLOCKERS.md#look-it-up-yourself).

| You see             | Look with                                                                         |
| ------------------- | --------------------------------------------------------------------------------- |
| a check is red      | GitHub `get_job_logs` on the failed job → fix the line it names                   |
| a workflow run died | GitHub `actions_list` → `get_job_logs` · re-dispatch once with the input it names |

Found and fixed → add its row to the table it belongs in — here if any Expo repo would meet it,
in the project's own `BLOCKERS.md` if not — in the same commit as the fix. The next loop reads
it and never looks again.

Cannot be fixed by an agent — a secret, a bill, a connector permission, a merge, a product
call → [a blocker with no row](#a-blocker-with-no-row).

## Signing in

| Blocker                                        | What it is                                             | Steps                                            |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| `--app-url host … differs from --api-url host` | a cookie set for one host is never sent from the other | serve both from `localhost`, dropping the tunnel |

## Driving the flow

| Blocker                                                  | What it is                                                                | Steps                                                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a selector never appears                                 | 15s is a workstation's default, or no `testID`                            | `node .claude/kitchen/scripts/drive.mjs <flow> --timeout 60000` → still absent? add the `testID`, [named here](../../../.maestro/README.md#naming-what-a-flow-taps)                                                             |
| `is not a command this runs`, `needs a config document`  | `drive.mjs` refuses the flow                                              | rewrite to the commands it runs → or add one, with its line in `drive.test.mjs`                                                                                                                     |
| shots, then a warning                                    | the flow hit a wall partway                                               | keep the shots taken before it → name the wall in the row                                                                                                                                           |
| a blank page at exit 0                                   | two `react-dom` copies, so no route mounts                                | list its copies (`pnpm why react-dom`, `npm ls react-dom`) → pin one version with the package manager's `overrides` or `resolutions`, per [SURFACES](../../skills/verify-expo/SURFACES.md#expo-web) |
| the landing screen where a route was asked for           | a URL was opened rather than a flow driven                                | `node .claude/kitchen/scripts/drive.mjs <kitchen.flows>/flows/<name>.yaml`                                                                                                                                                             |
| `${VAR}` asserted literally, or `nothing defines ${VAR}` | `drive.mjs` substitutes a command's string form only, not a map's `text:` | `- assertVisible: ${VAR}` rather than `text: ${VAR}` under it · the default goes in the flow's `env:`                                                                                               |
| an `id`+`text:` assertion with a pattern (`text: "[1-9][0-9]*"`) times out on a runner while the element is on screen | `drive.mjs` filtered `text:` as a literal substring, while Maestro reads it as a regex | `locate` builds a `RegExp` from `text:`, so a check means the same on web and native; a literal still matches itself, so write regex characters only where a pattern is meant |

## Shooting the base

[`shoot-pair.sh`](../scripts/shoot-pair.sh) is the whole of it, so these are where it stops.
It shoots the base in a worktree, never in the branch's checkout.

| Blocker                                                                                                                                                               | What it is                                                                                                                                                                                                                                                                                                               | Steps                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session-up.sh: No such file or directory` on the base                                                                                                                | a script run from the checkout of a base older than the script                                                                                                                                                                                                                                                           | merge `origin/main` into the branch for the latest `shoot-pair.sh`: it lays the branch's `.claude` scripts over the base worktree                                                                                                                   |
| `drive.mjs` says `Please run npx playwright install`                                                                                                           | the checkout predates `chrome-linux64/` support, so `drive.mjs` cannot find the pre-installed browser                                                                                                                                                                                                                    | merge `origin/main` into the branch; before that lands, `CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-*/chrome-linux64/chrome`                                                                                                                     |
| the Before flow never reaches the screen                                                                                                                              | this branch is what builds that screen                                                                                                                                                                                                                                                                                   | write `not built` in the cell. Carry on                                                                                                                                                                                                             |
| the After shows the base's screen                                                                                                                                     | Metro serves the checkout it started in, and one from an earlier run still holds the port                                                                                                                                                                                                                                | `.claude/kitchen/scripts/dev-server.sh stop` before each checkout → `start` after → re-shoot that half; `session-up.sh up` restarts both servers every time                                                                                                 |
| a run uploads After shots only, `Drive the base` ends in 39s, and its log says `fatal: '--detach' cannot be used with '-b/-B/--orphan'` — `infra:before-shot-missing` | `kitchen-shoot-expo-web.yml` was dispatched with `base: main`, and its checkout is detached, so `main` is not a local ref: `git rev-parse main` printed `main` back and exited 128 inside `$(...)`, where `-e` never saw it, and `git checkout --detach main` then failed. `continue-on-error` kept the run green with no Before | the base step now resolves the input as a commit, then as `origin/<input>`, and fails the run naming the input if neither exists · re-dispatch `shoot-expo-web.yml` on the head, with `base: main` or a sha · cite the `-before.png` URLs it prints |
| `git diff origin/main...HEAD` says `unknown revision`, or `shoot-pair.sh` cannot find a merge-base | a fresh container clones the branch alone, so `origin/main` is no ref yet | `git fetch origin main` · `shoot-pair.sh` does it itself when the ref is missing |
| `sh: 1: tsx: not found`, `node_modules missing`, then `session-up failed on the branch` within seconds | a fresh container has nothing installed, and the fixture loader runs `tsx` | `.claude/kitchen/scripts/install.sh` → run it again · `session-up.sh` installs when `node_modules` is missing, so a branch that fails here predates that: merge `origin/main` |
| `before=cached (failed)` for a flow that was edited since, and a `-failure-before.png` of the old failure | an older `shoot-pair.sh` keys the Before cache by merge-base alone | `rm -rf .claude/tmp/shots/before-<sha>/<flow>*` → run it again · the current script keys the cache by the flow file's content as well |
| every flow printed `after=failed` and the exit status was still 0 | an older `shoot-pair.sh` exits 0 whatever the flows did | read the printed `after=` lines, never the status · the current script exits 1 when any After failed |

## Shooting the design

| Blocker                                                                                          | What it is                                                                                                           | Steps                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/design/<file> is not committed`                                                            | the ticket names an export nobody has committed                                                                      | Design cell `blocked · design not committed`, key `design:<file>` → the reader exports it per [`/design-setup`](../../skills/design-setup/SKILL.md) step 2      |
| the design shot is the rail, not the screen                                                      | the chip label clicked nothing, or matched twice                                                                     | re-read the chip from the `.dc.html` → re-dispatch with the numbered form, `06 PROFILE`                                                                         |
| `_ds is missing` warning                                                                         | the design renders with fallback fonts and empty boxes                                                               | shoot anyway → design review holds fidelity findings as suspect                                                                                                 |
| a design card sits below the fold and the shot misses it — `design:no-capture-path-to-feed-card` | `capture.mjs` has `--full-page`, but `kitchen-shoot-design.yml` never passed it, so every design shot was the first viewport | dispatch `shoot-design.yml` with `full-page: true` · a chip that matches no text (`Home`) is a wrong label: read it from the `.dc.html`, or chain taps with `>` |

## Getting it onto the PR

A session hosts its own shots on an `evidence/<pr>` branch and writes its own PR body —
[`/evidence`](../../skills/evidence/SKILL.md) steps 5 and 6.

| Blocker                                                                   | What it is                                                                                        | Steps                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `fatal: expected 'acknowledgments', received 'packfile'` on a push        | the proxy's negotiation, then the push goes on and lands                                          | none, if `git ls-remote origin refs/heads/evidence/<pr>` shows the commit · else push again |
| `cannot lock ref 'refs/heads/evidence': 'refs/heads/evidence/302' exists` | a branch cannot be named `evidence` beside `evidence/<n>`: a ref cannot be a file and a directory | push to `evidence/<pr>`, never a bare `evidence`                                            |
| `push-shots: origin is '…', which is not <kitchen.repo>` | origin names the repo's old name, or a fork: GitHub answers to the old name, so the push would land and print URLs the body's sanitizer treats as foreign | `git remote set-url origin https://github.com/<kitchen.repo>` → run it again · nothing was pushed, so there is nothing to clean up |
| `git push --delete evidence/<n>` answers `HTTP 403` | the session's git proxy refuses to delete a ref, and no tool the session holds deletes a branch | leave the branch · name it in the hand-over for a person to delete · never push a probe to a branch you cannot remove |

### The runner

These are what `kitchen-shoot-expo-web.yml` runs into.

| Blocker                                                                                         | What it is                                                                                                                                                                                                                                             | Steps                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `took no screenshots`                                                                           | the runner is slower than the flow's timeout                                                                                                                                                                                                           | re-dispatch with a higher `timeout` input                                                                                                                                                              |
| a `kitchen-shoot-expo-web.yml` run reads stalled, 30+ min in Setup or Drive — `infra:shoot-run-stalled` | not stalled: a run stamped `cancelled` ended in 2 minutes, and a healthy one takes 4–7 (Setup 12s, Drive the branch ~100s, Drive the base ~70s) · `created_at` against `updated_at` is the real elapsed time, not the clock of the session watching it | `actions_get` the run → `completed` + `cancelled` is a cancel someone sent, not a hang · dispatch once more and leave it alone · only a run `in_progress` past its 45-minute `timeout-minutes` is hung |

## Building for a native change

| Blocker                                         | What it is                                                           | Steps                                                                                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eas build` / `eas whoami` says `Not logged in` | this container carries no `EXPO_TOKEN`, and `~/.expo` has no session | post `blocked` naming it, per [`/verify-expo`'s native-change path](../../skills/verify-expo/SURFACES.md#a-native-change-and-the-build-that-carries-it) — the reader supplies the token or runs the build themselves |

## Reading GitHub

| Blocker                                                                                                    | What it is                                                 | Steps                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a claim comment you cannot find                                                                            | the issue was claimed by id, and yours lost                | re-read the comments → `claims.mjs classify` with `nowFromId` your comment: its `winner` (the lowest live claim id) wins → `update_issue_comment` yours to `🤖 **Released** · #<n> · lost to <winning comment id> · <ts>` → take the next ticket |
| a phase returns no parsable last line                                                                      | the sub-agent reported prose instead of a receipt          | treat it as `blocked` → name the phase                                                                                                                                                                                     |
| the workflow is not there to dispatch                                                                      | `workflow_dispatch` registers only from the default branch | merge it first                                                                                                                                                                                                             |
| every job fails in ~2s, `recent account payments have failed or your spending limit needs to be increased` | the org's GitHub Actions billing, not this push            | post `blocked` naming it — the reader fixes billing, then re-runs the push's checks                                                                                                                                        |
| `subscribe_pr_activity` says the Claude GitHub App isn't installed                                         | no PR events will reach the session                        | `send_later` a check-in → re-read CI and threads on each · the reader installs the app                                                                                                                                     |
| a push to the PR's head branch is refused, `this session may not push` — `connectors:session-pr-branch-push` | the push to the PR's head branch was refused, so the fix lap has nowhere to land · the refusal is the whole attempt: no fix of the session's makes it succeed | push to the PR's head branch first · refused → step 10's block with that key, `Next` naming the branch and the refusal's words · `/unblock` owns it: a person widens the Routine session's push scope to that branch, or pushes the fix lap themselves |
| `/find-work` ran `/drive-pr-green` three ticks in a row on one PR, each ending in a `🤖 **Released**` comment | a run released its claim on a stop instead of blocking, so the PR kept winning the queue | label the PR `kitchen.labels.blocked` with the `🧱` issue per `/drive-pr-green` step 10 · step 1 blocks a PR `claims.mjs` reads stalled, under `connectors:session-pr-branch-push` or `infra:drive-stalled` |

## Unblocking

| Blocker                                                                         | What it is                                  | Steps                                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `blocked.mjs parse` says `not a blocker comment`                                | the comment was hand-written, not formatted | re-post it through `blocked.mjs format` → parse again                                                           |
| `needs-human` or `blocked` is missing on `issue_write`                          | the label has never been created            | GitHub creates it on first use · still refused? file the issue without it — its `🧱 <key>` title still finds it |
| a PR labelled `blocked` has no `🧱` comment                                     | an unmerged dependency, not a stall         | leave it                                                                                                        |
| a `🧱` comment has no `Issue` bullet                                            | it predates blocker issues                  | file it per [`/drive-pr-green`](../../skills/drive-pr-green/SKILL.md) step 10 items 2–3                          |
| a `🧱 <key>` issue carries two `✅ **Fixed**` comments                          | the fix did not hold, twice                 | escalate: `human · <key> · <area> · <what was tried twice>`                                                     |
| a `🧱 <key>` issue holds a `🤖 **Claimed**` that `claims.mjs` reads live       | another agent is fixing it                  | leave it — never fix a claimed issue                                                                            |

## Setting up the kitchen

`node .claude/kitchen/scripts/doctor.mjs` names one of these under each check it fails. `--offline` skips the checks that reach GitHub or start the app.

| Blocker | What it is | Steps |
| --- | --- | --- |
| `kitchen:config-missing` | `.claude/kitchen.json` does not exist | run `/kitchen-setup`, which writes it · or `sync-skills.sh --init expo`, which lays down a skeleton |
| `kitchen:config-invalid` | `kitchen.json` names a key the schema does not have, or a value of the wrong type | fix the key doctor names, against `.claude/kitchen/kitchen.schema.json` · a key left out takes the schema's default, so delete rather than guess |
| `kitchen:denylist-missing` | the project has no `kitchen-denylist.txt` at its root | create it empty: `: > kitchen-denylist.txt` · `/kitchen-setup` fills it |
| `kitchen:denylist-blank-line` | the list holds a blank line, and `grep -F -f` matches a blank pattern against every line, so every file reads as a leak | delete the blank line · an empty list is a zero-byte file, never a single newline |
| `kitchen:adapter-contract` | an action the slot's contract needs is missing, not executable, or does not parse, for the adapter `kitchen.adapters.<slot>.use` names | check the name against `.claude/kitchen/adapters/<slot>/` · `custom` adapters live in `.claude/adapters/<slot>/` and need every action · `chmod +x` the file doctor names |
| `kitchen:workflow-missing` | a `kitchen-*.yml` workflow is not in `.github/workflows/`, or not yet on the default branch, where `workflow_dispatch` registers | re-run `sync-skills.sh` · on disk but not on GitHub → merge the sync PR first |
| `kitchen:doctor-no-token` | doctor reads labels, workflows and variables through the GitHub API and has no token, or the token cannot read the repo | export `GH_TOKEN` with repo read access, or run `doctor.mjs --offline` and check those three by hand |
| `kitchen:labels-missing` | a label `kitchen.labels` names does not exist on the repo | dispatch `kitchen-bootstrap.yml`, which creates every one · a renamed label is renamed in `kitchen.json`, never on GitHub alone |
| `kitchen:runner-variable` | the `KITCHEN_RUNNER` or `KITCHEN_MAC_RUNNER` repository variable disagrees with `kitchen.ci` | a person sets the variable to the value doctor prints (Settings → Secrets and variables → Actions → Variables), or changes `kitchen.ci` to match · `node .claude/kitchen/scripts/kitchen.mjs variables` prints both |
| `kitchen:session-up` | `session-up.sh up` exited non-zero before printing the Expo URL | run it by hand and search these rows for the last lines it printed · a fresh repo most often lacks the secrets its adapters name, or `node_modules` |
| `kitchen:home-shot` | the app came up but `capture.mjs` could not shoot `/` at `kitchen.expo.viewport` | `npx playwright install chromium` · then open the URL doctor printed: a blank page is the [driving](#driving-the-flow) rows |

## A blocker with no row

You tried the rows and [looked it up yourself](#look-it-up-yourself), and it still stands.

1. Stop. Don't widen the PR, and don't post a shot of something else because a shot exists.
2. Post the blocker, formatted — dot points, one line each, no prose:

   ```bash
   echo '{"key":"<area>:<slug>","stopped":"<step>","error":"<what failed>","tried":"<what you did>","next":"<the one next thing>"}' \
     | node .claude/kitchen/scripts/blocked.mjs format
   ```

3. Return `blocked · <key> · <comment url>`. The driver,
   [`/drive-pr-green`](../../skills/drive-pr-green/SKILL.md), labels the PR `blocked` once its one
   retry fails, and files the blocker on one `🧱 <key>` issue that the comment names under
   `Issue` — the explanation lives there, not in the PR.
4. [`/unblock`](../../skills/unblock/SKILL.md) claims that issue on the next tick, so no other
   agent takes it: an agent fixes it and closes it, or it tags the owner
   [`kitchen.json`](../../kitchen.json)'s `humans` names on that same issue and labels it `needs-human`.
5. Once it is understood, add its row — here, or in the project's own `BLOCKERS.md` — in the
   PR that fixes it.

```markdown
🧱 **Blocked** · `infra:api-not-answering`

- **Stopped at** · evidence · `/settings`
- **Error** · the API server did not answer within 300s
- **Tried** · a longer ready timeout · a clean restart of both servers
- **Next** · read the server's log for why it never serves
- **Issue** · #123
```

Keys are `area:slug`. The area picks who gets tagged: `code`, `infra`, `secrets`, `billing`,
`connectors`, `database`, `native`, `design`, `product`, `merge`. One root cause, one key, on
every PR it hits, one `🧱 <key>` issue — that is how `/unblock` fixes it once.
