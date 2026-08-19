# skills

Claude Code skills that belong to no single project. One source of truth, consumed two ways.

| Skill | What it does |
|---|---|
| `arc-hero` | Arc.net-style landing page heroes, navbars, scalloped dividers, corner gradients, pill CTAs |
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
step and no network access. So cloud-facing projects copy these directories in and commit them,
pinned to a commit they chose.

`locket-v2` does this with `.claude/scripts/sync-skills.sh`, which re-clones each upstream, copies
one directory per skill into `.claude/skills/`, and records what it took in `.claude/skills.lock`.
Copy that script into any project that needs the same.

**Do not do both in one project.** A vendored copy plus an installed plugin gives you every skill
twice — once as `/content-review`, once as `/jacksontriffon-skills:content-review`.

## Changing a skill

Change it here, then re-sync the projects that vendor it. A hand-edit inside a project's
`.claude/skills/` is overwritten by the next sync — `skills.lock` names the source of every
vendored skill so the next reader knows which ones that applies to.

A skill earns its place here when it carries no path, no convention, and no vocabulary from a
single project. Anything that reaches for `docs/`, a tracker's labels, or a brand stays where it
came from.

## Licence

MIT
