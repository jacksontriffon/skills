# The loops

Four loops run a project on the kitchen. Each one's mechanics live in its skill. What's here is
how they fit together — read down `Eats` and `Leaves` and the cycle closes. What a project adds
to it — its Routines' names, its risk floors, where its setup is still open — is in its own
`docs/agents/loops.md`, where it keeps one.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json). A label is a
`kitchen.labels` key, and the name in the tables is its default.

Build and Unblock share one Routine. [`/find-work`](../../skills/find-work/SKILL.md)
runs [`next-work.mjs`](../scripts/next-work.mjs), which reads the queues and names the one
item to work, then runs the one skill that works it: `/unblock`, then `/drive-pr-green`,
then `/pick-up-ticket`. The choosing is the script's, so a session holds the item and its skill
and never the queues. A tick that finds nothing runs `next-work.mjs audit`, which lists what no
loop will pick and no person is clearly asked about: work that landed but stayed open, epics
with every child closed, `🧱` issues blocking nothing, labels waiting on a person for days. A stalled PR outranks an unfinished one, and an unfinished one outranks a
new ticket, so nothing new is built while something already built waits on an agent. `urgent`
(`kitchen.labels.urgent`), a label on an issue that `/pick-up-ticket` copies to its PR, reorders
inside a queue — those items first — and never jumps one queue over another. A skill
that finds nothing it may claim answers `none ·`, and one that stops without a receipt did no
work: either way the tick moves to the next queue. A `done`, `findings` or `blocked` receipt ends
the tick.

| Loop    | Fires                                                                                                                                                                          | Eats                          | Leaves                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build   | the Routine `kitchen.routines.work` → [`/find-work`](../../skills/find-work/SKILL.md), third in line → [`/pick-up-ticket`](../../skills/pick-up-ticket/SKILL.md)                | open issues no label excludes | PRs driven by [`/drive-pr-green`](../../skills/drive-pr-green/SKILL.md): `auto-merge`, `ready-for-human`, or `blocked`                              |
| Unblock | the Routine `kitchen.routines.work` → `/find-work`, first in line → [`/unblock`](../../skills/unblock/SKILL.md)                                                                | `blocked` PRs                 | PRs resumed through `/drive-pr-green`, or their `🧱 <key>` issue labelled `needs-human`, tagging [`kitchen.json`](../../kitchen.json)'s `humans` owner |
| Test    | a Routine of the project's own → `/test-pr`, where the project carries it until the kitchen ships it in v2                                                                    | open PRs                      | a draft PR per lane, with device-test steps; a finding on one feeds `/retest-pr`                                                                    |
| Fix     | the Routine `kitchen.routines.errors` → [`/fix-top-error`](../../skills/fix-top-error/SKILL.md)                                                                                | error-tracking issues         | PRs driven by `/drive-pr-green`, same as Build                                                                                                      |

```
                                           ┌─ risk:low · auto-merge ─→ merged on green, verdict's SHA pinned
/pick-up-ticket ─┐                         ├─ ready-for-human ─→ a human merges
                 ├─→ /drive-pr-green <pr> ─┤
/fix-top-error ─────┘        ▲             └─ blocked ─→ /unblock (next tick)
                             │                              ├─ agent fixes it ──┐
                             └──────────────────────────────┘                   │
                                                            └─ 🧱 issue, needs-human → human closes it ─→ next /unblock resumes
```

Schedule and enabled state live in the Routine. A cron copied into Markdown is wrong the
first time it's retuned.

Only a low-risk PR is merged by a loop: `/drive-pr-green`'s last step merges it once CI is
green, pinned to the commit its risk verdict names. Every other PR waits for a human to press
the button. [ADR 0004](adr/0004-the-change-sets-the-risk-tier-and-the-tier-sets-who-merges.md)
says why a tier sets who merges, [ADR 0006](adr/0006-the-loop-merges-a-low-pr-on-the-commit-its-verdict-names.md)
why the loop and not GitHub's auto-merge, and **The change sets who merges**, below, says which
is which.

Each loop, and each phase it dispatches as a sub-agent, is an **unattended** skill and takes
the shape in [`SKILL-TEMPLATE.md`](SKILL-TEMPLATE.md): numbered steps each naming a
criterion, one `## Stuck` pointing at [`.claude/BLOCKERS.md`](../../BLOCKERS.md) and
[`BLOCKERS.core.md`](BLOCKERS.core.md), one
`## Output`. [`skill-shape.mjs`](../scripts/skill-shape.mjs)'s `UNATTENDED` is the
set, and its test is what holds them there.

A skill one of those reaches for in passing is not in it: `/implement` hands a spike to
`/prototype` and a fact-finding pass to `/research`, and both stay prose, because a human
reads their output before anything is built on it.

The code loops above end at a PR a human merges. The outbound and content loops — scripts,
emails, posts, video scripts, thumbnails — end at a control a human merged, and run on a
different cycle: research, draft, publish, measure, then fix or promote. A project that runs
them keeps their model in its own `docs/agents/content-loops.md`.

## The agents

A phase a loop dispatches is a named agent in [`.claude/agents/`](../../agents), not a
`general-purpose` one, so each can be given the model its work needs. An agent's model is
`agents.<name>.model` in [`.claude/kitchen.json`](../../kitchen.json), one of `inherit`,
`haiku`, `sonnet` or `opus`; where that is silent, the default below applies. Claude Code reads
`model:` from the agent file's frontmatter, so after changing it run

```bash
node .claude/kitchen/scripts/agents.mjs sync
```

which rewrites each agent's frontmatter from `kitchen.json`. `agents.mjs check` reports the
same drift without writing. [`agents.mjs`](../scripts/agents.mjs)'s test
fails on drift, on an agent file with no valid frontmatter, on a loop skill that links an
agent that has no file, and on one that dispatches `general-purpose`. `inherit` means no
`model:` line: the agent runs on the session's model. `lane-rebaser` is not configurable.

| Agent              | Dispatched by                          | Default |
| ------------------ | -------------------------------------- | ------- |
| `implementer`      | `/pick-up-ticket` step 4, `/retest-pr` | inherit |
| `code-reviewer`    | `/drive-pr-green` step 5               | inherit |
| `content-reviewer` | `/drive-pr-green` step 5               | haiku   |
| `evidence-runner`  | `/drive-pr-green` step 7               | haiku   |
| `design-reviewer`  | `/drive-pr-green` step 8               | haiku   |
| `risk-reviewer`    | `/drive-pr-green` step 9               | inherit |
| `blocker-fixer`    | `/unblock` step 4                      | inherit |
| `lane-rebaser`     | `/test-pr` step 2                      | inherit |

An agent cannot dispatch another, so a skill that fans out internally (`/code-review`'s two
axes, `/design-review`'s comparison) runs that part inline when it is itself an agent.

A phase moves back to the session's model by setting its `agents.<name>.model` to `inherit`.
The content loop's phases are `general-purpose`.

## What no skill says

**The reviews converge on one fix lap.** Code and content review each return findings
against the same frozen commit, and the loop absorbs all of them in a single lap rather than
one lap an axis — two phases naming the same lines are read together and fixed once. Content
review runs only when the diff carries user-facing strings.

**Evidence is the one camera, and design review judges what it shot.** `/evidence` shoots
Design, Before and After in one lap, in one session; `/design-review` runs after it on any PR whose
evidence reached a screen, and takes no shots of its own. A design finding buys one more lap —
fix, re-shoot the After, re-check — then `blocked`
([ADR 0003](adr/0003-design-review-reads-evidences-shots.md)). A fix nothing photographed is
unevidenced, so no code lands after the last evidence run.

**A phase hands back a receipt, not its findings.** One line — the verdict, a count, the URL
of what it posted — parsed by [`receipt.mjs`](../scripts/receipt.mjs). The detail
stays on GitHub, because a driver that takes four hundred words an axis back into its own
context eventually drops itself mid-run
([ADR 0001](adr/0001-a-phase-posts-its-detail-and-returns-a-receipt.md)). `/drive-pr-green`
writes those receipts into the PR body's checks table as they arrive, so the PR says what has
been checked at every moment rather than only at the end.

**The change sets who merges.** [`/risk-review`](../../skills/risk-review/SKILL.md) runs
last, after the last push, and asks two questions of the diff: which tier it earns, and whether
it needs a person even so. [`risk.mjs`](../scripts/risk.mjs) sets a floor from the
paths that neither answer can lower. A fixed floor — CI, the gate itself and `drive-pr-green`
are `high`; `.claude/` and the lockfile are `medium` — no config can lower, and
[`kitchen.json`](../../kitchen.json)'s `risk.high` and `risk.medium` globs, written from the repo
root with `*` inside a segment and `**` across them, add the project's own: the schema, auth and
money are the usual `high`; native code and the agents' own docs the usual `medium`, as is a diff
over `risk.largeDiffLines` lines of code. A `low` verdict names its head SHA. Before merging,
`/drive-pr-green` runs the base branch's copy of `risk.mjs gate` and merges with that SHA as
`expectedHeadSha`. So a push after the verdict, a merged base branch included, refuses the merge
until risk review runs again.

**A red check after hand-over belongs to the runtime, not the loop.** Build and Fix both end
at hand-over before CI finishes; a red check holds an `auto-merge` PR where it is, and a
green one is merged by the next tick. A loop fired by its Routine runs under a harness
whose own rules make an opened PR that session's to drive to green; those rules are not in
the project. `/drive-pr-green` subscribes to the PR before hand-over regardless, so a Build or
Fix run started any other way still has a watcher.

**Blocked is a hand-off, not an ending.** `/drive-pr-green` fixes what it meets through
[`BLOCKERS.md`](../../BLOCKERS.md), [`BLOCKERS.core.md`](BLOCKERS.core.md) and the connectors. What survives one retry becomes
one `🧱 <key>` issue per root cause, listing every PR it blocks, a `🧱 **Blocked**` comment on
each PR naming that issue, and the `blocked` label. `/unblock` works the issues, not the PRs:
it claims one before fixing it, so one cause is fixed once and never by two agents, and a cause
no agent can clear pings its owner once, on that same issue, labelled `needs-human`. The
human's whole job is the `Do` line, then closing the issue.

**A conflict sends a PR back.** When the base branch moves under a PR, a handed-over one included, it
goes to the front of `/drive-pr-green`'s queue. A merge that only keeps one side or both leaves
the reviews and evidence standing, and the PR goes back to where it was handed over with a
comment saying how each hunk was resolved — after a fresh risk review, since the merge is a new
head. A hunk rewritten by hand moves the change, so the PR is
driven again in full. A conflict no agent can resolve is a `merge:` block.

**A device-test failure goes in as a comment on the lane PR**, under the steps-table row that
failed. That row names the PR the fix belongs on — lane branches are thrown away, so a fix
that lands on one dies with it.
`/retest-pr`, in a project that carries the Test loop, is what reads that comment: it maps
the row to the PR, fixes it there, and re-enters `/test-pr` to rebuild the lane, rather than
leaving the finding for someone to hand-carry across.
