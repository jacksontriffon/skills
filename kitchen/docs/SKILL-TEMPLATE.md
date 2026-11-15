# The shape an unattended skill takes

Some skills run with nobody watching — fired by a Routine, or dispatched as a phase by one
that is. Each takes the shape below.
[`skill-shape.mjs`](../scripts/skill-shape.mjs)'s `UNATTENDED` is the set, and
[`skill-shape.test.mjs`](../scripts/skill-shape.test.mjs) fails the build when one drifts off the
shape.

A skill a human drives is prose, and none of this binds it.

## Why a shape at all

An unattended run has no one to ask. Every step therefore answers three questions by itself:
**am I done**, **what do I do when this fails**, and **what do I hand back**. A step missing any
of the three is where a run stalls silently, and the shape is what stops that being possible.

## The shape

```markdown
---
name: <directory name, exactly>
description: <what it does. When to use it.>
---

# <Title>

<What it eats, what it leaves, in a line or two. Any standing fact a step would
otherwise repeat — the repo, the base branch, the project id.>

## 1. <Verb>

<What to do.>

Done when <the criterion, checkable by reading something that exists>.

## 2. <Verb>

...

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into, each with the steps
out. Stopping is for a blocker with no row there.

## Output

<The one artefact the caller takes. For a phase, the receipt line.>
```

## What the check enforces

| Rule | Why |
| --- | --- |
| Frontmatter `name` matches the directory | a mismatch loads the skill under a name nothing dispatches |
| A `description`, non-empty | it is what decides whether the skill is reached at all |
| Steps are `## 1.`…`## N.`, contiguous, two or more | a caller resumes at a number, so a gap is a step nobody runs |
| Every step carries a `Done when` line | a step that cannot be finished is a step a run stalls in |
| The file links to `BLOCKERS.md` and `BLOCKERS.core.md` | a blocker met once is met in every loop |
| A `## Output` heading | a caller that has to infer the output re-derives it |
| A step that writes an ISO time runs `date -u` before it | a recalled time can be hours off, and a claim's age is read from it |

The check reads the link, not the `## Stuck` heading that should hold it, and it counts no
section twice. So a skill with two `## Output` headings passes and is still wrong — the table
above is the contract, and the check is the part of it a machine can hold.

## Writing a criterion

`Done when` takes a state you can read, not an intention you can hold.

| Not a criterion | A criterion |
| --- | --- |
| Done when the diff is understood. | Done when every changed file names a screen, or the command printed nothing. |
| Done when the review is thorough. | Done when every surviving line reads `Fix <what> because <why>`. |
| Done when the app is working. | Done when every shot has been opened and shows the screen it names. |

A step whose criterion will not come honestly is a step doing two things. Split it.

## The output of a phase is a receipt

A skill `/pick-up-ticket` dispatches as a phase ends on a **receipt** — one line, parsed by
[`receipt.mjs`](../scripts/receipt.mjs), and nothing else:

```
done · 0 found · https://github.com/<owner>/<repo>/pull/431#issuecomment-1
findings · 3 found, 2 fixed, 1 open · <url>
blocked · no verification bucket · <url>
```

The detail goes to GitHub; the receipt says where. That split is
[ADR 0001](adr/0001-a-phase-posts-its-detail-and-returns-a-receipt.md) — handing the
findings back instead would put a review's prose into the orchestrator's context, and a driver
that grows drops itself mid-run.

A skill that is not a phase names its real artefact instead: a plan, a table, a URL.
