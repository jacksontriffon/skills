---
name: kitchen-setup
description: Configure this repo for the kitchen's loops — write .claude/kitchen.json and kitchen-denylist.txt, create the labels and the scheduled work and errors Routines, and print what only a person can do. Run once after `sync-skills.sh --init expo`, and again when a slot's adapter or an owner changes.
disable-model-invocation: true
---

# Set up the kitchen

The kitchen reads every value that differs between projects from one file,
[`.claude/kitchen.json`](../../kitchen.json), validated by
[`kitchen.schema.json`](../../kitchen/kitchen.schema.json). A key left out takes the schema's
default, so the file you write holds only what this project changes. This skill asks for those
values, writes the file and the project's denylist, creates the labels and the two Routines, and
ends on the list of things only a person can do.

This is a prompt-driven skill, not a script. Explore, present what you found, ask one section at a
time with the recommended answer first, show the draft, then write.

## 1. Explore

Read what exists; assume nothing.

- `.claude/kitchen.json` — `sync-skills.sh --init expo` wrote a skeleton with the Expo app it
  found (`expo.appDir`, `expo.routesDir`, `expo.appId`, `expo.scheme`), the package manager and
  the base branch. Keep what it detected unless the person corrects it.
- `node .claude/kitchen/scripts/kitchen.mjs brief` — the file resolved against its defaults. An
  error here names the key to fix before anything else.
- `git remote -v` — the GitHub repo, as `owner/name`.
- `.claude/kitchen/adapters/<slot>/` for each slot (`stack`, `db`, `auth`, `errors`,
  `evidenceHost`) — one directory per adapter this kitchen ships, and a `README.md` naming each
  one's settings. `.claude/adapters/<slot>/` holds a project's own, under the name `custom`.
- `kitchen-denylist.txt` at the repo root — usually empty.
- The GitHub MCP's `get_me` — who is running this, the likely default owner.
- `list_triggers`, where the scheduled-task tool exists — Routines already set up.

## 2. Ask

One section, one answer, then the next. Skip a section exploration already settled.

**A · Repo.** Propose the `git remote` as `repo`. Ask for `product`, the name a person reads, only
when it differs from the repo's name.

**B · Humans.** A blocker an agent cannot fix is tagged to a person. Propose the `get_me` handle
as `humans.default`, then ask once whether any area has a different owner: `secrets`, `billing`,
`connectors`, `database`, `native`, `design`, `product`, `merge`. Write only the areas that
differ.

**C · An adapter per slot.** For each slot, list the adapters under
`.claude/kitchen/adapters/<slot>/`, recommend the schema's default (`kitchen.mjs brief` prints it),
and offer `none` and `custom`. Read the chosen adapter's section of the slot's `README.md` and ask
for each setting it names. A slot at its default with no settings is left out of the file.
`evidenceHost` has one adapter in v1, so it is not asked.

**D · The errors project.** Skip it when `errors` is `none`, which turns the Fix loop off. Otherwise
the errors adapter's `README.md` names the settings it pins, such as the organization, project and
timezone. Read them through the tracker's MCP rather than taking them from memory, and confirm the
project by name. Ask also for the project's **error doc**, the file a person keeps on what the
app reports and what the sweep skips (`doc`), and its catalogue of analytics events (`events`),
if it keeps them.

**E · The design source.** Ask whether screens are designed in Claude Design. Yes → its exports
are committed under `design` (default `docs/design`), and `/design-setup` names the export each
ticket builds from. No → design review reports `no design` and nothing else changes.

**F · CI.** Recommend GitHub's own runners, which need nothing. A project on other runners names
their labels as `ci.runner` and `ci.macRunner`. Then ask which repository secrets and variables
the app needs to start on a runner — a database URL, an auth secret, a public key the bundle
ships — and write their names to `ci.secrets` and `ci.vars`. Never their values. Ask where a
preview update's API lives: `deployment` for a host that posts GitHub deployments of each PR, a
fixed URL, or nothing.

**G · The denylist.** Propose the strings that mark this project and must never reach a shared
file: the product name, `repo`, the app id and scheme, and any tracker or database project id
from sections C and D. One literal a line, matched in any case.

## 3. Confirm

Show two drafts and let the person edit them:

- `kitchen.json` — only the keys that differ from the schema's defaults, with
  `"$schema": "./kitchen/kitchen.schema.json"` first.
- `kitchen-denylist.txt` — one literal a line.

## 4. Write

1. Write `.claude/kitchen.json`, then run
   `node .claude/kitchen/scripts/doctor.mjs --offline --only config`. A failure names the key.
2. Write `kitchen-denylist.txt`. A non-empty list is its lines each ending in one newline:
   `printf '%s\n' "${literals[@]}" > kitchen-denylist.txt`. An empty list is a zero-byte file,
   `: > kitchen-denylist.txt`. **Never a blank line, and never a lone newline in an empty list**:
   `grep -F -f` reads a blank pattern as one that matches every line, and every file in the repo
   then reads as a leak. `doctor.mjs --offline --only denylist` checks it.
3. `node .claude/kitchen/scripts/agents.mjs sync`, when `agents` sets a model, so each agent's
   frontmatter says what the file says.
4. Commit both files on a branch named per `conventions.branch` and open a PR. It touches
   `.claude/`, so a person merges it.

## 5. Create the labels

Dispatch `kitchen-bootstrap.yml` on the base branch with the GitHub MCP's `actions_run_trigger`
(`run_workflow`). It creates every label `labels` names from the rows
`doctor.mjs --labels` prints, and leaves one that exists alone. `workflow_dispatch` registers only
from the default branch, so a workflow the sync PR has not yet merged cannot be dispatched: say so,
and dispatch it once that PR is in.

## 6. Create the Routines

Where the session has the scheduled-task tool, `list_triggers` first and create only what is
missing:

| Routine | Name | Schedule | Fires |
| --- | --- | --- | --- |
| work | `routines.work` | hourly | `/find-work`, in a fresh session each run |
| errors | `routines.errors` | daily, at an hour the person picks | `/fix-top-error`, in a fresh session each run |

Create `errors` only when the errors adapter is not `none`. The work Routine is hourly because the
loop merges a low PR whose CI was still running at hand-over on the next tick, so its cadence is
the merge latency.

Without the tool, print both rows for a person to create in claude.ai, and say that the loops do
not run until they exist.

## 7. Print the checklist

An agent cannot do these. Print them as a checklist, with what this project's answers added:

- [ ] Install the Claude GitHub App on the repo, with permission to merge.
- [ ] Add a ruleset on `baseBranch` that refuses a merge while CI is red.
- [ ] Make CI a required check in that ruleset. There is no risk-gate check to require.
- [ ] Settings → Actions → General: allow GitHub Actions to create and approve pull requests.
- [ ] Add the repository secrets and variables `ci.secrets` and `ci.vars` name, and `EXPO_TOKEN`.
- [ ] Set the `KITCHEN_RUNNER` and `KITCHEN_MAC_RUNNER` variables to what
      `node .claude/kitchen/scripts/kitchen.mjs variables` prints, when they are not GitHub's own.
- [ ] Allow npm, Expo and GitHub in the cloud environment's network policy.
- [ ] Connect the error tracker's MCP, when `errors` is not `none`.

## 8. Run doctor

`node .claude/kitchen/scripts/doctor.mjs`, or the `kitchen:doctor` package script. It checks
the file against the schema, the denylist, each adapter's contract, the workflows, the labels and
runner variables on GitHub, and that `session-up.sh` brings the app up and shoots its home route
at `expo.viewport`. Each failure names a row of
[`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md#setting-up-the-kitchen): do its steps
and run doctor again until it is green. `--offline` skips the GitHub and app checks for a run
before the setup PR merges.

Setup is done when doctor is green. The next step is the build loop's first ticket:
`/grill-with-docs` → `/to-spec` → `/to-tickets`, and the work Routine picks it up.
