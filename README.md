# skills

Claude Code skills that belong to no single project. One source of truth, consumed two ways.

| Skill | What it does |
|---|---|
| `arc-hero` | Arc.net-style landing page heroes, navbars, scalloped dividers, corner gradients, pill CTAs |
| `content-review` | Line-by-line review of a draft against nine rules — tense, voice, sentence length, word choice, cuts |
| `grill-batch` | Resolves a queue of wayfinder decision tickets in one pass instead of one per session |

`grill-batch` assumes the wayfinder map and ticket model from
[`mattpocock/skills`](https://github.com/mattpocock/skills); the other two stand alone.

## Setting up a project

Six steps from an empty repo to skills that load on the first turn. Each links to the section
that explains it.

**1. Choose vendored or plugin.** A project any cloud session touches — claude.ai/code, GitHub
Actions, the mobile or desktop app — has to vendor; a plugin is not there when the container
starts. A project only ever opened on your own machine can install the plugin instead and skip to
step 6. [Why](#choosing-vendored-or-plugin) · **never both**.

**2. Drop the sync script in.**

```bash
mkdir -p .claude/scripts
curl -fsSL https://raw.githubusercontent.com/jacksontriffon/skills/main/scripts/sync-skills.sh \
  -o .claude/scripts/sync-skills.sh
chmod +x .claude/scripts/sync-skills.sh
```

**3. Name the sources** — skip this to vendor only this repo. Most projects want Matt Pocock's
alongside it, since that is where the main flow lives. Write `.claude/skills.sources`:

```
# owner/repo | default ref | dirs holding one subdirectory per skill
jacksontriffon/skills|main|skills
mattpocock/skills|main|skills/engineering skills/productivity
```

[More on sources](#more-than-one-source).

**4. Sync, then commit what it wrote.**

```bash
.claude/scripts/sync-skills.sh
git add .claude/skills .claude/skills.lock .claude/scripts .claude/skills.sources
git commit -m "vendor claude code skills"
```

`.claude/skills/` is the part that has to be committed — it is what arrives with the clone.
[`skills.lock`](#skillslock) records where each directory came from.

**5. Point the skills at your tracker.** If you took Matt's, run `/setup-matt-pocock-skills`
once. It asks which issue tracker this repo uses, what triage labels you apply, and where
generated docs live, then writes the answers to `docs/agents/issue-tracker.md` — which
`/triage`, `/to-spec`, and `/to-tickets` all read. Commit that file too.

**6. Restart Claude Code.** Skills are discovered at startup, so a session already running will
not see them. Type `/` to check: a vendored skill is listed under its bare name, a plugin one
under `jacksontriffon-skills:`.

### The flow the skills run in

Matt's skills chain into one pass from a rough idea to a reviewed PR:

```
/grill-with-docs  →  /to-spec  →  /to-tickets  →  /implement  →  /code-review
stress-test          write it up  split it        build it       review it
```

`/ask-matt` picks the right one when you are unsure. The three skills in *this* repo sit around
that spine rather than inside it: `/content-review` over any prose the flow produces,
`/arc-hero` when the ticket is landing-page UI, and `/grill-batch` to clear a queue of wayfinder
decision tickets in one session instead of one each.

## Choosing: vendored or plugin

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

[`scripts/sync-skills.sh`](scripts/sync-skills.sh) does the vendoring, and steps 2 to 4 above are
all it takes to start. With no configuration it vendors this repo. Every run re-clones each source,
replaces one directory per skill under `.claude/skills/`, deletes the directories that source no
longer ships, re-applies that project's deltas, and rewrites `.claude/skills.lock`. Only skills a
source has vendored before are in reach of that deletion, so the project's own skills survive.

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

## Licence

MIT
