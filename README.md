# skills

Claude Code skills that belong to no single project. One source of truth, consumed two ways.

| Skill | What it does |
|---|---|
| `business-metrics` | Reduces a business to seven dials, then its growth rate and profit ceiling at SOM |
| `content-review` | Line-by-line review of a draft against nine rules — tense, voice, sentence length, word choice, cuts |
| `grill-batch` | Resolves a queue of wayfinder decision tickets in one pass instead of one per session |

`grill-batch` assumes the wayfinder map and ticket model from
[`mattpocock/skills`](https://github.com/mattpocock/skills); the other two stand alone.

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

With no configuration it vendors this repo's portable skills. Every run re-clones each source,
replaces what that source ships, deletes what it no longer ships, re-applies that project's deltas,
and rewrites `.claude/skills.lock`. Only what the lock says a source vendored before is in reach of
that deletion, so the project's own files survive.

```bash
.claude/scripts/sync-skills.sh                          # every source at its locked commit
.claude/scripts/sync-skills.sh --latest                 # every source at its default ref
.claude/scripts/sync-skills.sh jacksontriffon/skills    # one source, at its locked commit
.claude/scripts/sync-skills.sh mattpocock/skills v1.3.0 # a tag, branch, or commit
.claude/scripts/sync-skills.sh --init expo [--app DIR]  # first run in an Expo repo
```

**Asking for nothing gets you the commit already locked**, so a bare run reproduces the tree
instead of walking upstream forward. Moving a source is a thing you say out loud — name a ref, or
pass `--latest`. Without that, a sync run for an unrelated reason drags a month of someone else's
changes into your diff.

### More than one source

`.claude/skills.sources` overrides the default, one `owner/repo|ref|dirs|type` per line. `type` is
`skills` when left off, so a file written before types existed means what it always did.

```
# owner/repo | default ref | dirs | type (skills when omitted)
jacksontriffon/skills|main|skills
jacksontriffon/skills|main|kitchen|kitchen
mattpocock/skills|main|skills/engineering skills/productivity
```

- **`skills`** — `dirs` is space-separated, and each names a directory holding one subdirectory per
  skill. Each skill directory is replaced whole.
- **`kitchen`** — `dirs` names the kitchen root (`kitchen`). The sync copies it file by file to where
  a project expects each part:

  | In the source | Lands in the project at |
  | --- | --- |
  | `kitchen/skills/<name>/` | `.claude/skills/<name>/` |
  | `kitchen/agents/*.md` | `.claude/agents/` |
  | `kitchen/scripts/**`, `adapters/**`, `docs/**` | `.claude/kitchen/scripts/`, `adapters/`, `docs/` |
  | `kitchen/kitchen.schema.json` | `.claude/kitchen/kitchen.schema.json` |
  | `kitchen/workflows/<name>.yml` | `.github/workflows/kitchen-<name>.yml` |
  | `kitchen/templates/**` | nothing — only `--init` reads it |

Two sources shipping the same skill name, or the same file, fail the run rather than letting one
win silently. So does a kitchen file that would land on a file the lock does not own: that file is
the project's, and the run stops before writing anything. If the bytes are identical the file is
adopted instead, so a project that already holds a copy can switch to the synced one.

### `skills.lock`

`.claude/skills.lock` records what the sync owns, as tab-separated rows. A `skills` source writes
one row per skill directory: name, source, ref, commit, date. A `kitchen` source writes one row per
file: its path in the project, source, ref, commit, date, and the sha256 it shipped with.

The lock is what a bare sync reads to pin itself, and it is the boundary of deletion. A re-sync
deletes a skill directory or a file only when the lock owned it and the source has dropped it. A
path with no lock row is never in reach, so the project's own skills, agents, scripts and workflows
survive every sync, even beside the kitchen's in the same directory. Grep the lock before editing a
file under `.claude/`.

### First run in an Expo repo: `--init expo`

`--init expo` is the sync's first run in a repo that wants the kitchen. It is plain shell plus
`node`, needs no Claude session, and is what puts `/kitchen-setup` into the repo.

```bash
mkdir -p .claude/scripts
curl -fsSL https://raw.githubusercontent.com/jacksontriffon/skills/main/scripts/sync-skills.sh \
  -o .claude/scripts/sync-skills.sh
chmod +x .claude/scripts/sync-skills.sh
.claude/scripts/sync-skills.sh --init expo
```

It assumes no layout:

1. **Finds the Expo app** — the package whose `dependencies` include `expo`, at the root or in any
   workspace that `package.json` `workspaces` or `pnpm-workspace.yaml` declares. If it finds none, or
   more than one, it asks rather than guesses, and with no terminal to ask on it stops having
   written nothing. Name the app up front with `--app <dir>`.
2. **Detects the package manager** from the lockfile — pnpm, yarn, bun or npm, and pnpm when there is
   none — and the workspace tool (turbo, nx, lerna, or the package manager's own workspaces).
3. **Writes `.claude/skills.sources`** naming the portable skills and the kitchen, unless one exists.
4. **Vendors everything**, exactly as a sync does.
5. **Writes the starter files once.** A file that already exists is kept, and a re-run writes
   nothing new:

   | File | Starts as |
   | --- | --- |
   | `.claude/kitchen.json` | The detected repo, package manager, workspace tool and `expo.*` paths, app id and scheme, plus `flows`, `design` and `humans.default`. Adapters take the schema's defaults. A value init cannot find is left out for `/kitchen-setup` to fill |
   | `.claude/settings.json` | Permissions and the SessionStart hook running `kitchen.mjs brief`. An existing file only gains the rules and hook it lacks |
   | `CLAUDE.md` | The kitchen's few lines, appended once between `kitchen:start`/`kitchen:end` markers |
   | `package.json` | The `drive`, `test:scripts` and `kitchen:doctor` scripts, each added only when its name is free |
   | `.claude/BLOCKERS.md`, `docs/agents/{issue-tracker,triage-labels,domain}.md`, `.maestro/{config.yaml,README.md,flows/home.yaml}`, `docs/design/{README,DEVIATIONS}.md`, `kitchen-denylist.txt` | Starters from [`kitchen/templates/expo/`](kitchen/templates/expo/) |

Then open a Claude session, run `/kitchen-setup`, and run `<package manager> kitchen:doctor` until
it is green.

### Deltas

The sync replaces each vendored skill directory and kitchen file whole, so a hand-edit is gone on
the next run —
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

## Licence

MIT
