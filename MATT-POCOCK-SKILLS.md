# Where the forked skills came from

Eighteen of the skills in [`skills/`](skills/) began as copies of
[`mattpocock/skills`](https://github.com/mattpocock/skills), used under its MIT licence. **They are
a fork now, not a vendored copy**: each has been edited in place, and upstream's changes arrive
only as a read of its diff and a hand-port.

|                  |                                                         |
| ---------------- | ------------------------------------------------------- |
| Source           | https://github.com/mattpocock/skills                    |
| Forked at commit | `2ab958093e83e0ec752e6c1c5932da465bf23e0c` (2026-07-28) |
| Plugin version   | `1.2.0` at that commit                                  |
| Licence          | MIT                                                     |

**From upstream, in `skills/`** — `codebase-design`, `diagnosing-bugs`, `domain-modeling`,
`grill-me`, `grill-with-docs`, `grilling`, `handoff`, `improve-codebase-architecture`,
`prototype`, `research`, `resolving-merge-conflicts`, `setup-matt-pocock-skills`, `tdd`, `teach`,
`to-spec`, `to-tickets`, `triage`, `writing-great-skills`

**From upstream, in `kitchen/skills/`** — `code-review` and `implement`, rewritten to the
kitchen's unattended shape ([`SKILL-TEMPLATE.md`](kitchen/docs/SKILL-TEMPLATE.md)), so they are
the kitchen's rather than Matt's whatever they started as.

Not taken: `ask-matt` and `wayfinder`, which stay with the project they were forked into until a
second project needs them.

The flow Matt teaches still holds: `/grill-with-docs` → `/to-spec` → `/to-tickets` →
`/implement` → `/code-review`.

## Name collisions to know about

- **`/code-review`** shadows Claude Code's built-in. The kitchen's runs the two-axis review —
  Standards and Spec, in parallel sub-agents. Rename its directory and frontmatter `name` in a
  project to get the built-in back.
- **`/research`, `/implement`, `/triage`, `/prototype`** are generic names. Nothing else here
  claims them.

## Licence

mattpocock/skills is MIT-licensed, Copyright (c) Matt Pocock. The fork keeps that notice; this
repo's own [`LICENSE`](LICENSE) covers the changes.
