---
name: find-work
description: One tick of the build loop — run next-work.mjs, which reads the GitHub queues and names the one item to work, then run the one skill that works it: /unblock, /drive-pr-green or /pick-up-ticket. Use for the build-loop Routine (`kitchen.routines.work`), when the user asks what to pick up next or wants a pass at the backlog, or to find out what the build loop would do next.
---

# Find work

A tick holds one item of work and the one skill that works it — never the queues. Choosing is
[`next-work.mjs`](../../kitchen/scripts/next-work.mjs)'s job: it reads the queues through GitHub
search, checks each PR for conflicts with git, applies every drop and rank rule the three skills
have, and prints one line. Do not list PRs or issues here, and do not load a skill before the
script names it. GitHub is the only state. Never merge here: a low PR is merged by
`/drive-pr-green`'s last step.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

The script tries the queues in order — `unblock`, then `drive`, then `ticket` — because a
stalled PR is worth more than a fresh one, and an unfinished PR more than a new ticket.
`kitchen.labels.urgent` reorders inside a queue, never across them.

## 1. Look

```bash
node .claude/kitchen/scripts/next-work.mjs
```

It reads nothing but GitHub search results and git: labels, dates, bodies and branches. A claim
is a label, `kitchen.labels.claimed`, live while the item was touched inside its window, so no
comment is read to choose. It prints one line:

| Line                      | Means                                                                         |
| ------------------------- | ----------------------------------------------------------------------------- |
| `unblock · …`             | blocker issues to fix, resume or close, and blocked PRs to re-file            |
| `drive · #<pr> · <group>` | the PR to drive, and why: `mergeable`, `conflicted` or `unfinished`           |
| `ticket · #<n>`           | the issue to build                                                            |
| `none · …`                | nothing in any queue, and what is held on a person                            |
| `error · …`               | GitHub search failed after its retries; nothing was decided                   |

`error ·` → search the BLOCKERS files for its words, do what the row says, and run it once more.
Still `error ·` → output it and stop: the next tick tries again.

Done when the script printed a line that is not `error ·`, or the run has stopped.

## 2. Choose

Read the last line:

| Last line     | Run                                                                                 |
| ------------- | ----------------------------------------------------------------------------------- |
| `unblock · …` | [`/unblock`](../unblock/SKILL.md), handed that line                                 |
| `drive · …`   | [`/drive-pr-green`](../drive-pr-green/SKILL.md), handed that line                   |
| `ticket · …`  | [`/pick-up-ticket`](../pick-up-ticket/SKILL.md), handed that line                   |
| `none · …`    | nothing — step 4                                                                    |

Done when one skill is chosen, or the run has gone to step 4.

## 3. Run

Run the chosen skill **in this session**, never as a subagent: each of them dispatches
subagents of its own, and one that is itself a subagent cannot.

A skill's output is a receipt when it starts `done ·`, `findings ·`, `blocked ·` or `none ·`.

- `none ·` → it found nothing it may claim — another session won the item since the script read it.
- No receipt — a release with a reason, a stop partway, prose — → it finished nothing, and a
  claim it released changes no label, so its queue would win again next tick. Treat it as
  `none ·`, and write its output on the line as it stands.

Either way, go back to step 1 and run the script again without the work that came back empty:

| Came back empty | Run next                                              |
| --------------- | ----------------------------------------------------- |
| `unblock`       | `next-work.mjs drive ticket`                          |
| `drive · #<pr>` | `next-work.mjs drive ticket --skip <pr>`, adding each PR skipped so far |
| `ticket`        | nothing — step 4                                      |

At most three skills a tick. A `done ·`, `findings ·` or `blocked ·` receipt is the tick's work,
whatever it says. Stop there, and do not run a second skill: one tick is one skill's worth of
work, and the next tick looks again.

Done when a skill returned a `done ·`, `findings ·` or `blocked ·` receipt, or three skills
have run, or the run has gone to step 4.

## 4. Audit

Only when no skill did work this tick: run

```bash
node .claude/kitchen/scripts/next-work.mjs audit
```

It lists what no loop will pick and no person is clearly asked about — tickets whose work already
landed, epics whose sub-issues are all closed, `🧱` issues blocking nothing, decisions nobody was
asked, labels waiting on a person for days, tickets whose PR was closed unmerged. It changes
nothing. Put its lines in the output as they stand: they are the person's to act on.

Done when the audit's lines are in the output.

## Stuck

Search [`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md)
for the error's words, never read them whole. `next-work.mjs` fails only on a `gh` search or the
git fetch; a skill that stops on a blocker has already posted it where its own steps say, so
this skill adds nothing to it — and a `blocked ·` receipt is a finished tick, not a reason to try
the next queue. A stop that posted no blocker is not one: step 3 goes on to the next queue.

## Output

One line per skill run, in order, each the skill's name then its output verbatim:

```
drive-pr-green · done · 3 found, 2 fixed, 1 open · https://github.com/<kitchen.repo>/pull/431
```

The last line is the receipt that ended the tick, unless every queue returned `none ·` or no
receipt: then no line did work, and the audit's lines follow. Or the script's own
`none · nothing to do · held: …` and the audit's lines, when step 1 found nothing.

A queue that returned no receipt stays on its line, and the run goes on to the next:

```
drive-pr-green · released #999 · fix lap needs a push to claude/eloquent-noether-ylf9l6
pick-up-ticket · done · 0 found · https://github.com/<kitchen.repo>/pull/1019
```
