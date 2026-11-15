---
name: design-review
description: Design review of the built UI against the design it was built from, screen by screen, judged from evidence's Design and After shots and reported on the PR. Use when the user wants a design review, or after /evidence has shot a PR that reaches a screen.
---

Screen-by-screen check: the **Design** shot beside the **After** shot, and a table of where
they differ.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

This phase has no camera. [`/evidence`](../evidence/SKILL.md) shoots Design, Before and After in
one lap in one session, and this judges two of the three — so the body's `Design` · `After` pair is
the pair that was judged
([ADR 0003](../../kitchen/docs/adr/0003-design-review-reads-evidences-shots.md)).

Reads the UI only — logic and persistence belong to code-review's Spec axis.

## 1. Read the contract

The ticket names the design two ways, and both are the **contract**:

- a `## Design` section, which `/design-setup` wrote — screen, route, auth, the steps to each side
- a design file or screen named in the prose — `<kitchen.design>/<Design Name>.dc.html`, `07b Sentence`

A screen of a design with no rail is reached by its row in `STATES.md` in `kitchen.design`,
not by a rail chip, and is shot at phone width, never `--desktop`.

Neither → the map's `## Screen index`, then matching route against screen by heading and copy,
naming the screen you picked so a wrong guess is visible. A screen still unmatched reads
`no design` and is not a finding.

A design file the contract names that is not in `kitchen.design` on the branch is `blocked ·
design not committed`, key `design:<file>`: a person holds the export, and
[`/design-setup`](../design-setup/SKILL.md) step 2 names what to ask for.

Given a list of screens — the re-check after a design lap — keep only those.

Done when every screen the contract names has a design file and a screen, or reads
`no design` or `blocked`.

## 2. Read evidence's shots

Evidence's comment on the PR carries a row a screen: `What` · `Design` · `Before` · `After` ·
`Steps`. Match each contract screen to its row, and download both halves — the URL, or the
workflow run's artifact.

A design screen with no row, or a row with no `Design` or `After`, is evidence's gap, not a
judgement: it reads `uncaptured` with the cell's own reason (`blocked`, `not built`). Never
shoot it yourself — a second After is a pair nobody else sees.

Open every shot before handing it on, both halves — [`/verify-expo`](../verify-expo/SKILL.md)
step 4 says why.

Done when every screen has an opened Design and After, or reads `uncaptured` with the reason.

## 3. Compare in one sub-agent

**One** `general-purpose` sub-agent takes the whole comparison: image tokens stay out of this
context, and one reader catches inconsistency between screens.

It sees only what you hand it — every pair by path and screen name, the screen's intent quoted
from the ticket, whether `_ds/` was there, and the surface's **ceiling** from evidence's comment.
Brief it:

> For each screen, report where the build differs from the design, in two lists.
> **Feature**: an element present on one side only, elements in a different order, different
> copy, a control that does something else. **Fidelity**: spacing, type (family, size, weight,
> letter-spacing, case), colour. Quote the screen name and say which side you mean. The design
> is a rail-less `.dc.html` shot at the build's own `kitchen.expo.viewport`, so compare pixel for pixel; an older
> export is a desktop artboard, where report proportion and order instead, and never call a
> reflow that follows from the narrower viewport a deviation. List
> separately anything that looks like a render artifact rather than a defect. Close with any
> inconsistency between screens. Under 500 words.

A missing `_ds/` in `kitchen.design` renders the design with fallback fonts, undefined custom properties
and empty component boxes: say so in the brief, and hold every fidelity finding as **suspect**.

Done when the sub-agent has returned its report.

## 4. Check the deviations

Read `DEVIATIONS.md` in `kitchen.design` on the branch — a PR may
add a row. Every feature gap whose screen and element match a row is **accepted**: it is not a
finding, and its `Fix` reads `accepted · D<n>`.

Behaviour the surface's ceiling covers is never a deviation either.

Done when every feature gap is accepted or a finding.

## 5. Report

One comment on the **PR**, two tables per [`/post-comment`](../post-comment/SKILL.md), the shot
URLs bare in the cells:

| Table                     | Columns                                    | Rows                                               |
| ------------------------- | ------------------------------------------ | -------------------------------------------------- |
| feature                   | `Screen` · `Design` · `Build` · `Fix`      | each finding, each accepted gap, each `matches`    |
| **Fidelity** · not blocking | `Screen` · `Fix`                         | each fidelity gap; the shots are above             |

Each `Fix` is an ask — the change that closes the gap, named with both values in six words:
`Add the streak ring above the list`. The two shots beside it are the `Because`. A screen the
contract named but nothing captured reads `uncaptured` with its reason; one with no design reads
`no design`. Cross-screen notes are rows whose `Screen` reads `all`. Never the sub-agent's prose.

Fidelity findings do not block hand-over: fixed in the lap where cheap, otherwise left as rows.

Post it as a comment, with the agent's own write; its images are the shots `/evidence` hosted on
`evidence/<pr>`, so they render
([ADR 0005](../../kitchen/docs/adr/0005-an-agents-own-write-keeps-the-projects-image-urls.md)).

Done when every screen has a row on the PR and the comment reads back with an image in every
captured cell.

## Bounds

A deviation is a finding, not a verdict — the driver fixes, defers or accepts it in its design
lap, and this phase changes no code.

Criteria the UI cannot show get no verdict: list them as out of scope, so the report is never
mistaken for a full check of the issue.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into — the shot that will not
download, the design that never rendered, the push that is refused — each with the steps
out. Stopping is for a blocker with no row there.

## Output

A receipt — [`receipt.mjs`](../../kitchen/scripts/receipt.mjs)'s one line — counting **feature** findings
only, accepted gaps excluded, and the comment's URL. Fidelity rows are in the comment and never
in the count.
