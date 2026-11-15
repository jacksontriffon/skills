# skills

Claude Code skills that belong to no single project. One source of truth, consumed two ways.

| Skill | What it does |
|---|---|
| `business-metrics` | Reduces a business to seven dials, then its growth rate and profit ceiling at SOM |
| `grill-batch` | Resolves a queue of wayfinder decision tickets in one pass instead of one per session |
| `tdd`, `grilling`, `grill-me`, `grill-with-docs`, `to-spec`, `to-tickets`, `triage`, `domain-modeling`, `codebase-design`, `diagnosing-bugs`, `prototype`, `research`, `resolving-merge-conflicts`, `handoff`, `teach`, `writing-great-skills`, `improve-codebase-architecture`, `setup-matt-pocock-skills` | A fork of [`mattpocock/skills`](https://github.com/mattpocock/skills) (MIT) — [`MATT-POCOCK-SKILLS.md`](MATT-POCOCK-SKILLS.md) has where each came from |

`grill-batch` assumes the wayfinder map and ticket model from
[`mattpocock/skills`](https://github.com/mattpocock/skills). `content-review` moved into the
kitchen, which is the only place it is used from: [`kitchen/skills/content-review`](kitchen/skills/content-review/SKILL.md).

[`kitchen/`](#the-kitchen) is the other half of this repo: the loops that turn an issue into a
merged PR with Before/After shots, for an Expo project. It is vendored, never installed.

## Using them

### On a local machine — install as a plugin

`~/.claude/` persists, so the plugin updates when this repo does.

```bash
claude plugin marketplace add jacksontriffon/skills
claude plugin install jacksontriffon-skills@jacksontriffon
```

Or declare it per-project in `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "jacksontriffon": { "source": { "source": "github", "repo": "jacksontriffon/skills" } }
  },
  "enabledPlugins": { "jacksontriffon-skills@jacksontriffon": true }
}
```

### In cloud sessions — vendor into the project

Claude Code cloud sessions (claude.ai/code, GitHub Actions, the mobile and desktop apps) run in an
**ephemeral container**. It clones the project fresh at session start and is reclaimed afterwards.
`~/.claude/plugins/` does not survive that, so a plugin installed in one cloud session is gone in
the next. A project's `settings.json` can *enable* an external plugin, but per the
[plugin docs](https://code.claude.com/docs/en/discover-plugins#configure-team-marketplaces) it
"doesn't load until the team member installs it" — in a fresh container that install has to happen
before the skills are usable.

Anything committed to a project's `.claude/skills/` **does** survive, because it arrives with the
clone, and Claude Code discovers every `.claude/skills/<name>/SKILL.md` at startup with no install
step and no network access. Vendoring is the only mechanism guaranteed to work on the first turn of
every cloud session.

The cost is that an update is a commit in the consuming project rather than a background upgrade.
That cost buys the thing an auto-updating plugin cannot give: a pinned commit per project, and a
reviewable diff when it moves.

**Do not do both in one project.** A vendored copy plus an installed plugin gives you every skill
twice — once as `/content-review`, once as `/jacksontriffon-skills:content-review`.

## `sync-skills.sh`

[`scripts/sync-skills.sh`](scripts/sync-skills.sh) does the vendoring. Drop it into a project once:

```bash
mkdir -p .claude/scripts
curl -fsSL https://raw.githubusercontent.com/jacksontriffon/skills/main/scripts/sync-skills.sh \
  -o .claude/scripts/sync-skills.sh
chmod +x .claude/scripts/sync-skills.sh
.claude/scripts/sync-skills.sh
```

With no configuration it vendors this repo. Every run re-clones each source, replaces one directory
per skill under `.claude/skills/`, deletes the directories that source no longer ships, re-applies
that project's deltas, and rewrites `.claude/skills.lock`. Only skills a source has vendored before
are in reach of that deletion, so the project's own skills survive.

```bash
.claude/scripts/sync-skills.sh                          # every source at its locked commit
.claude/scripts/sync-skills.sh --latest                 # every source at its default ref
.claude/scripts/sync-skills.sh jacksontriffon/skills    # one source, at its locked commit
.claude/scripts/sync-skills.sh mattpocock/skills v1.3.0 # a tag, branch, or commit
```

**Asking for nothing gets you the commit already locked**, so a bare run reproduces the tree
instead of walking upstream forward. Moving a source is a thing you say out loud — name a ref, or
pass `--latest`. Without that, a sync run for an unrelated reason drags a month of someone else's
changes into your diff.

### More than one source

`.claude/skills.sources` overrides the default, one `owner/repo|ref|dirs` per line. `dirs` is
space-separated, and each names a directory holding one subdirectory per skill.

```
# owner/repo | default ref | dirs holding one subdirectory per skill
jacksontriffon/skills|main|skills
mattpocock/skills|main|skills/engineering skills/productivity
```

Two sources shipping the same skill name fails the run rather than letting one win silently.

### `skills.lock`

`.claude/skills.lock` records the source, ref, commit, and date behind every vendored skill, as
tab-separated rows. It is what a bare sync reads to pin itself, and it is what tells the next
reader which directories under `.claude/skills/` are copies. Grep it before editing one.

### Deltas

The sync replaces each vendored skill directory whole, so a hand-edit is gone on the next run —
**silently**, which is the failure worth designing against.

A change a project needs in a skill it does not own lives as a patch under
`.claude/skills-deltas/<source-with-slashes-as-underscores>/<skill>.patch`, re-applied after every
sync. A patch that stops applying **exits non-zero** rather than reverting quietly. Cut one from a
working tree the sync has just reverted:

```bash
git diff -R -- .claude/skills/<skill> > .claude/skills-deltas/<source>/<skill>.patch
```

A delta is a standing tax. For a skill in this repo the answer is to fix it here instead — this
repo exists so those deltas do not have to.

## Changing a skill

Change it here, then re-sync the projects that vendor it, naming the new ref:

```bash
.claude/scripts/sync-skills.sh jacksontriffon/skills main
```

[`scripts/validate-skills.sh`](scripts/validate-skills.sh) runs on every push and pull request. A
`SKILL.md` with broken frontmatter does not error at startup — the skill is simply absent, and the
first anyone hears of it is a slash command that does nothing. The check catches that: every skill
needs a `SKILL.md` opening with closed `---` frontmatter, a `description`, and a `name` matching
its directory.

## What belongs here

A skill earns its place when it carries no path, no convention, and no vocabulary from a single
project. Anything that reaches for `docs/`, a tracker's labels, or a brand stays where it came
from, until that reach becomes configuration.

## The kitchen

`kitchen/` is a software factory for an Expo app: an hourly Routine runs `/find-work`, which
unblocks a stuck PR, drives an open one to hand-over, or builds the next ticket — and every PR it
opens carries Before/After shots. A low-risk PR merges itself on green; the rest wait for a
person. `/fix-top-error` runs the same way off the error tracker.

| Part | Lands in a project at | What it is |
|---|---|---|
| `kitchen/skills/<name>/` | `.claude/skills/<name>/` | the loop skills, and `/kitchen-setup` |
| `kitchen/agents/*.md` | `.claude/agents/` | the subagents the loops dispatch |
| `kitchen/scripts/` | `.claude/kitchen/scripts/` | the scripts and their tests, `doctor.mjs` included |
| `kitchen/adapters/` | `.claude/kitchen/adapters/` | one directory per backend, per slot |
| `kitchen/docs/` | `.claude/kitchen/docs/` | the PR format, the loops, `BLOCKERS.core.md` and the ADRs |
| `kitchen/kitchen.schema.json` | `.claude/kitchen/kitchen.schema.json` | what `.claude/kitchen.json` may say, and its defaults |
| `kitchen/workflows/<name>.yml` | `.github/workflows/kitchen-<name>.yml` | previews, shooting, bootstrap, the scripts' tests |

A project changes none of these files. Everything that differs between projects goes through one
of four doors:

1. **`.claude/kitchen.json`** — the repo, who owns what, labels, paths, risk floors, runners and
   the app's CI environment. [`kitchen.schema.json`](kitchen/kitchen.schema.json) holds every key
   and its default, so a fresh file is `repo` and `humans.default`.
2. **An adapter per slot** — `stack`, `db`, `auth`, `errors` and `evidenceHost`. The defaults are
   `supabase-local`, `supabase-migrations`, `supabase-auth`, `none` and `git-branch`; `custom`
   points a slot at `.claude/adapters/<slot>/` in the project.
3. **A project-owned file a skill names** — `.claude/BLOCKERS.md`, `docs/agents/*.md`, the flows
   folder, and `kitchen-denylist.txt` at the repo root.
4. **A hook** — `.claude/session-up.d/`, run in order when the app is stood up.

A project that needs a fifth door files an issue here: a delta in a vendored kitchen file is a
kitchen bug.

### Setting it up

After the sync lays the kitchen down, run `/kitchen-setup` in a Claude session. It asks for the
repo, the owners per area, an adapter per slot, the error tracker's project and the design source;
writes `kitchen.json` and the denylist; dispatches `kitchen-bootstrap.yml` for the labels; creates
the hourly work Routine and the errors one; and prints what only a person can do. Then
`node .claude/kitchen/scripts/doctor.mjs` until it is green — each failure names its row in
[`BLOCKERS.core.md`](kitchen/docs/BLOCKERS.core.md#setting-up-the-kitchen).

### Why not the plugin

The kitchen stays out of [`.claude-plugin/`](.claude-plugin/). A plugin cannot carry workflows or
a SessionStart hook, and the kitchen's merge gate must run from a pinned, reviewable copy.

### Its CI

[`validate.yml`](.github/workflows/validate.yml) runs every test under `kitchen/scripts/`, with
the skill-shape, agent and adapter contract tests as their own steps, against a sample project in
[`kitchen/scripts/fixtures/`](kitchen/scripts/fixtures/). The same tests run in each project
against that project's own `kitchen.json`, through `kitchen-scripts.yml`. A project's denylist
stays with the project, so [`check-kitchen-literals.mjs`](scripts/check-kitchen-literals.mjs)
holds `kitchen/` and `skills/` to rules that need no list: no repo but this one and the upstreams
it credits, no app id outside `com.example`, and the adapter vocabulary only under
`kitchen/adapters/`.

## Licence

MIT
