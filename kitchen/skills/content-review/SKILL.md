---
name: content-review
description: Review written content line by line against nine rules: tense, voice, sentence length, word choice, cuts. Use when the user wants a draft reviewed, tightened, sharpened, or punched up, or wants a copy pass before publishing.
---

# Content review

Line-by-line review of a draft against nine rules. Every sentence is accounted for: it passes
all nine, or it appears in the report with its fix.

Prose is never photographable, so the quoted line is its own evidence — a reader sees the cost
in it rather than being told.

## 1. Take the draft

Whatever was handed over: a `.md` file, a PR body, or the user-facing strings a diff adds.
[`/pick-up-ticket`](../pick-up-ticket/SKILL.md) extracts those to `.claude/tmp/copy.md` and points here.

A one-word button label answers to word choice and nothing else. The nine are prose rules, and
stretching them over a label invents findings.

Done when every line to be reviewed is in one place.

## 2. Run the nine rules

- [ ] **Present tense** — "She wins the deal"
- [ ] **Active voice** — "He closes the sale", not "The sale is closed by him"
- [ ] **Verbs carry the force** — "She sprints", not "She runs quickly"
- [ ] **Short sentences** — "The offer fails. We rebuild it. It works."
- [ ] **Few commas** — "He tries. He fails. He tries again."
- [ ] **Simple words** — "Use", not "Utilize". Third-grade reading level.
- [ ] **Say what is** — "Keep it short", not "Don't make it long"
- [ ] **One word per idea** — "Past history" → "History"
- [ ] **Cut what survives cutting** — "In order to win, you need to work hard" → "To win, work
      hard". Same meaning, so the cut stands.

A cut holds only when the meaning remains the same. Where it does not, the sentence passes.

Done when every sentence either passes all nine or has a rewritten line waiting for it.

## 3. Report

Quote the line, show the fix. [`/post-comment`](../post-comment/SKILL.md) shapes it: one table
under `Line` · `Fix`, each `Fix` the rewritten line rather than the name of its flaw.

Never skip the comment because the draft passed all nine. Post it with no rows and say so in
one line — a pass nobody can see reads exactly like a review that never ran.

Done when the comment is posted, with rows or with the line saying there are none.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into, each with the steps
out. Stopping is for a blocker with no row there.

## Output

A receipt — [`receipt.mjs`](../../kitchen/scripts/receipt.mjs)'s one line — carrying the number of
lines rewritten and the comment's URL.
