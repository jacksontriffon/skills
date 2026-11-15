---
name: drive-pr-green
description: Drive one open PR to hand-over — reviews fanned out, one fix lap, the Design/Before/After evidence, design review against it, a risk tier on the head, CI green. Low risk is merged here, pinned to the commit its verdict names; medium and high go to a person (`kitchen.labels.readyForHuman`). Stuck for good → files one `🧱 <key>` issue per root cause and labels the PR `kitchen.labels.blocked` for /unblock. Use after /pick-up-ticket opens a PR, when /unblock resumes one, or with no PR number to finish the most stalled one.
---

# Drive PR green

One PR in. One PR out: handed over with the shots in its body — `kitchen.labels.autoMerge` when
[`/risk-review`](../risk-review/SKILL.md) calls it low, `kitchen.labels.readyForHuman` otherwise —
or `kitchen.labels.blocked` and pointing at the `🧱 <key>` issue the next loop claims. The repo is
`kitchen.repo`, base `kitchen.baseBranch`. Merge only in step 11: a low PR, on the commit its
`🎚️ **Risk**` verdict names, once the base branch's copy of
[`risk.mjs`](../../kitchen/scripts/risk.mjs) agrees and GitHub calls it `clean`.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

**Handed over** means labelled `kitchen.labels.readyForHuman` or `kitchen.labels.autoMerge`.

**Fix what you hit.** Every failed command, every red check:

1. Find its row in [`BLOCKERS.md`](../../BLOCKERS.md) or [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md) → do the steps.
2. No row → look it up yourself with the connectors, per
   [`BLOCKERS.md`](../../BLOCKERS.md#look-it-up-yourself) → fix it.
3. Re-run what failed.

Only a blocker you tried to fix and could not reaches step 10's `blocked`. The one exception is
blocked without a fix try: a push to the PR's own head branch that is refused. A PR's fix lap
goes to its `head.ref`, whoever opened it, so push there first; its evidence shots go to
`evidence/<pr>`, as [`/evidence`](../evidence/SKILL.md) step 5 says. The
refusal is the attempt, and no fix of this session's makes the push succeed, so it goes
straight to step 10's block with key `connectors:session-pr-branch-push`, `Next` naming the
branch and the refusal's own words. Never a release.

## 1. Take the PR

Given a `drive ·` line from [`/find-work`](../find-work/SKILL.md), take its PR and group. Given a
bare number, take it.

Given none, run [`next-work.mjs`](../../kitchen/scripts/next-work.mjs) `drive`, adding
`--skip <pr>` for each PR this run already lost:

```bash
node .claude/kitchen/scripts/next-work.mjs drive
```

Do not list or read the PRs yourself. It leaves out lanes, PRs labelled `kitchen.labels.blocked`,
and PRs another session holds a live `kitchen.labels.claimed` on, itself or on the ticket it
closes; [`next-work.test.mjs`](../../kitchen/scripts/next-work.test.mjs) is the full rule set.
It names the PR's group, `kitchen.labels.urgent` first and then oldest first within each:

| Group      | The PR                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------- |
| mergeable  | labelled `kitchen.labels.autoMerge`, unless CI is still running on a push from the last 30 minutes |
| conflicted | does not merge cleanly with `kitchen.baseBranch`, handed over or not                        |
| unfinished | not handed over, draft or not                                                               |

A mergeable PR goes from step 2 straight to step 11, which merges it, waits on a running check,
or takes the label off. A conflicted PR goes next because it cannot merge, and a handed-over one
has nobody else coming for it.

`none ·` → output it and stop.

Done when one PR number is in hand, marked with its group, or the run has stopped at `none`.

## 2. Claim it

A claim is two things: the label `kitchen.labels.claimed` on the PR, which is what
`next-work.mjs` reads, and a comment, which settles a race and says how the run ended. Run
`date -u +%Y-%m-%dT%H:%MZ` before every comment this skill writes with a time in it — this
claim, each edit to it, its release — and use that output. This reading is `now` for the
checks in this step.

Add `kitchen.labels.claimed` to the PR — `issue_write` replaces the whole set, so pass every
label it carries plus that one — and comment on it, keeping the id:

```
🤖 **Driving** · #431 · step 2 · 2026-09-27T08:45Z
```

Re-read the comments and run `claims.mjs classify` on them with `{"nowFromId":<your comment id>,
"items":{…}}`, so the winner check uses GitHub's clock, read off the claim you just posted, and
not the `date -u` reading. The `winner` is the lowest live claim id.

| Read                   | Do                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| not yours              | edit your comment through `update_issue_comment` to the `lost` form below; leave the label on — it is the winner's — and step 1 again with `--skip <pr>` |
| yours, and stalled     | the block below                                                                            |
| yours                  | go on                                                                                      |

To tell whether it is stalled, classify the comments again without your own claim:

- stalled: `claims.mjs` reads `stalled` — its three newest claims before yours all stopped, by
  a release that gave a reason or a claim left to expire. Another lap meets the same stop, so
  a PR dropped as stalled gets step 10's block now (its items 1 to 5; read the PR with
  `pull_request_read` `get` first, for the body it keeps), under the key `claims.mjs` printed —
  `connectors:session-pr-branch-push` when every stop was a refused push, `infra:drive-stalled`
  otherwise — and `Next` quoting its `reasons`. That labels it `kitchen.labels.blocked`, so
  `/unblock` follows its issue to `kitchen.humans.default`, who is tagged there.

A claim says how it ended in one of three forms, written by `claims.mjs release` (give it
`{"subject":"#431","outcome":"done|blocked|lost","issue":…,"to":…,"ts":"<date -u output>"}`):

| Ends                               | The claim reads                                           |
| ---------------------------------- | --------------------------------------------------------- |
| a hand-over or a merge             | `🤖 **Released** · #431 · done · <ts>`                    |
| step 10's block                    | `🤖 **Released** · #431 · blocked · #<issue> · <ts>`      |
| losing the race above              | `🤖 **Released** · #431 · lost to <winning id> · <ts>`    |

Releasing a claim you won, wherever this skill says so, is both: edit the comment to its form,
and take `kitchen.labels.claimed` off the PR.

A claim you won is held until the run ends, at step 10 or step 11, and released there. Edit it
as you move — the step number and the `date -u` time — before dispatching an agent and after each
returns: that edit is the heartbeat, and it is what keeps the label live, since every edit
moves the PR's `updated_at`. A claim not edited for 90 minutes reads expired, and the next run
takes the PR over from step 3, which reads what is owed off the comments already posted. A step
waiting on a workflow run waits for it, editing the claim first: releasing to "resume from step
N next tick" leaves the PR with nobody driving it.

A run ends three ways: a hand-over, a merge, or step 10's block. A run that cannot go on is the
block, never a `Released` comment giving a stop reason — a release changes no label, so the next
tick takes the same PR again. `claims.mjs` counts three such releases in a row as stalled.

Done when the claim is posted, the label is on, and the comment's id is held — or the PR is
blocked as stalled.

## 3. Read what is owed

`pull_request_read`: `get`, `get_comments`, `get_check_runs`. Read the ticket its `Closes #<n>`
names. Note the head SHA.

A phase is **met** only if its comment was posted after the head commit. Everything else is
**owed**:

| Phase          | Owed when                                 | Skill                                           |
| -------------- | ----------------------------------------- | ----------------------------------------------- |
| code review    | always                                    | [`/code-review`](../code-review/SKILL.md)       |
| content review | the diff adds or changes user-facing text | [`/content-review`](../content-review/SKILL.md) |
| evidence       | always                                    | [`/evidence`](../evidence/SKILL.md)             |
| design review  | the diff reaches a screen                 | [`/design-review`](../design-review/SKILL.md)   |
| risk review    | always                                    | [`/risk-review`](../risk-review/SKILL.md)       |

**Reaches a screen** is evidence's call, not a reading of the file list: a row in its table that
is not the smoke screen. Until evidence has run on this head, design review reads `owed`; a PR
whose evidence shot only the smoke screen, or nothing, writes `n/a · no screen`.

A conflicted, handed-over PR is the exception. Its phases were met on the change, and merging
`kitchen.baseBranch` moves the head without moving the change. The first four read `met`, unless step 4
moves the change. Risk review is always owed on it: a verdict covers one commit, and the merge
is a new one.

Done when each of the five reads `met`, `owed` or `n/a · <reason>` against the head SHA.

## 4. Make it current and green

In this order, before any review:

1. `mergeable_state` is `dirty` or `behind` → merge `origin/<kitchen.baseBranch>` in → resolve per
   [`/resolving-merge-conflicts`](../resolving-merge-conflicts/SKILL.md). Migration clash →
   the db adapter's [README](../../kitchen/adapters/db/README.md#two-branches-one-number). Never
   rebase or force-push a branch you did not open. Write down every conflicted hunk: its
   file, and `kept base`, `kept PR`, `kept both` or `rewrote`. A `rewrote` hunk moves the
   change, so on a handed-over PR every phase step 3 marked `met` becomes owed. Take
   `kitchen.labels.readyForHuman` and `kitchen.labels.autoMerge` off, and the run goes on through steps 5–9 like any other
   PR.
2. A check is red → `get_job_logs` → fix the cause. Red on `kitchen.baseBranch` too → port the fix, say so
   in the body. Never skip, disable or quarantine a test.
3. Run the gates:

   ```bash
   pm=<kitchen.packageManager>; $pm run lint && $pm run format && $pm run typecheck && $pm run test
   ```

4. All green → push once → relabel per
   [`pr-format.md`](../../kitchen/docs/pr-format.md#labels).

Cannot get it green after trying → step 10's block.

A conflicted PR still handed over skips steps 5–8 and goes to step 9, then step 10's
hand-back.

Done when the gates pass locally, `mergeable_state` is neither `dirty` nor `behind`, and no check on the
head is red — or the run has gone to step 10's block.

## 5. Review

Every owed review from step 3 but design review, dispatched in **one message**, one agent each,
by name: [`code-reviewer`](../../agents/code-reviewer.md) agent for `/code-review`,
[`content-reviewer`](../../agents/content-reviewer.md) agent for `/content-review`. Hand each:
the PR, the branch, the ticket. Wait for all of them. Design review waits for step 8, because it
judges evidence's shots.

- `/content-review` gets the diff's user-facing strings in `.claude/tmp/copy.md`.
- Each returns one [`receipt.mjs`](../../kitchen/scripts/receipt.mjs) line. Anything else = `blocked`.
- Write each receipt into its row of the body's checks table (`update_pull_request`). A
  `blocked` receipt also writes the body's
  [needs-a-human block](../../kitchen/docs/pr-format.md#the-needs-a-human-block) in the same call.
- A review returns `blocked` → fix the cause per the top of this skill → dispatch it again,
  once. Still `blocked` → step 10's block.

Done when every dispatched review has returned a receipt and its checks row is filled.

## 6. Fix

One lap. Every finding from every review, together.

1. Two findings on the same lines → read both, fix once.
2. Fix → gates from step 4 → green → push → relabel.
3. Anything left unfixed stays in its row: `3 found, 2 fixed, 1 open`.

Scripts (lint, type, test, CI) get laps until green. Reviews get this one lap.

Done when every finding is fixed or counted open, and the gates are green on the pushed head.

## 7. Evidence

One [`evidence-runner`](../../agents/evidence-runner.md) agent running
[`/evidence`](../evidence/SKILL.md). Hand it the PR, the branch and the ticket — the ticket
names the design screens it shoots beside the diff's.

| It returns | Do                                                                                   |
| ---------- | ------------------------------------------------------------------------------------ |
| `done`     | write the receipt into the checks row → step 8                                       |
| `findings` | fix them → push → dispatch it again, once                                            |
| `blocked`  | read its comment → fix the cause per the top of this skill → dispatch it again, once |

Still `blocked` after that retry → step 10's blocked branch.

A hand-back from an evidence agent that has already returned its receipt is a duplicate: ignore
it and stop that agent.

Done when evidence's receipt is in its checks row, and it reads `done` or `findings`, or
reads `blocked` after one fix-and-retry.

## 8. Design review

Design review `n/a` from step 3 → step 9.

Otherwise one [`design-reviewer`](../../agents/design-reviewer.md) agent running
[`/design-review`](../design-review/SKILL.md). Hand it the PR, the branch, the ticket and
evidence's comment — its Design and After shots are what it judges. Write its receipt into the
checks row.

| It returns | Do                                                                                   |
| ---------- | ------------------------------------------------------------------------------------ |
| `done`     | step 9                                                                               |
| `findings` | one design lap, below                                                                |
| `blocked`  | read its comment → fix the cause per the top of this skill → dispatch it again, once |

**The design lap**, once:

1. Each finding takes one of three ends:

   | The finding                                            | End                                                                                                                                |
   | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
   | inside what the ticket asked for                       | fixed in this PR                                                                                                                   |
   | its fix lies in another ticket's screen or component   | deferred: the issue that owns it, found or opened, gets the Design and After shots through [`/screenshot`](../screenshot/SKILL.md) |
   | the app is right, for a reason from outside the design | accepted: a row in `DEVIATIONS.md` under `kitchen.design`, in this PR                                               |

   "Simpler to build" is neither of the last two. Each deferred or accepted one is a row in the
   body's gaps table.

2. Fix → gates from step 4 → green → push → relabel.
3. Dispatch evidence again. It re-shoots the After alone; Before and Design are cached.
4. Dispatch design review again, on the screens that had findings.

Still a finding neither fixed nor deferred after that lap → it stays `open` in its row, and the
run goes to step 10's block under the `design` area. Never a third lap.

Done when design review's receipt is in its checks row and every finding it raised is fixed,
deferred to a named issue, or accepted in `DEVIATIONS.md` — or the run has gone to step 10's
block.

## 9. Risk review

Last, because its verdict names one commit: nothing is pushed after it. A push after it, for
any reason, owes it again.

One [`risk-reviewer`](../../agents/risk-reviewer.md) agent running
[`/risk-review`](../risk-review/SKILL.md). Hand it the PR, the branch, the head SHA and the
ticket. Write its receipt's first two fields into the checks row: `low · merges on green`.

| It returns         | Do                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------ |
| `low`              | step 10's hand-over, then step 11's merge                                            |
| `medium` or `high` | step 10's hand-over, to a person                                                     |
| `blocked`          | read its comment → fix the cause per the top of this skill → dispatch it again, once |

Still `blocked` after that retry → step 10's block.

Done when the risk receipt is in its checks row and a `🎚️ **Risk**` comment names the head
SHA — or the run has gone to step 10's block.

## 10. Hand over, or block

**Evidence returned `done` or `findings`, every design finding fixed, deferred or accepted,
risk reviewed on this head, nothing blocked → hand over:**

1. `subscribe_pr_activity` on the PR.
2. Write the final body — the Aim as the PR opened with it, the unblocks table read again
   from the ticket's GitHub links, change table, evidence table with its `Design` column, the gaps
   table where design review left one, checks table, the `Left before merge` table where
   anything is owed, `Next · auto-merge` on a low or `Next · merge` otherwise, `Closes #<n>`,
   and no needs-a-human block, since nothing is blocked —
   with `update_pull_request`. Start from the body `/evidence` wrote and keep its evidence table
   and `<img>` cells as they stand: those URLs are this repo's own, so the write keeps them. Read
   the body back, and count the `<img>` tags against the evidence table's. A cell that lost its
   tag held a URL that is not this repo's: push the shot to `evidence/<pr>` and write it again.
3. Relabel: `pr-labels.mjs`, then keep the risk label step 9 set (`kitchen.labels.riskLow`, `kitchen.labels.riskMedium` or `kitchen.labels.riskHigh`). Mark ready for review.

   | Tier               | Then                                                                                 |
   | ------------------ | ------------------------------------------------------------------------------------ |
   | `low`              | add `kitchen.labels.autoMerge` → step 11                                             |
   | `medium` or `high` | add `kitchen.labels.readyForHuman`                                                   |

4. Release the claim (`done`): edit its comment, take the label off — on a low, at the end of step 11. `.claude/kitchen/scripts/dev-server.sh stop`, which stops Metro and the `stack` adapter's API.

**A conflicted PR still handed over, nothing blocked → hand back:**

1. Comment on the PR. Give the `kitchen.baseBranch` SHA that was merged, then one row for each hunk step 4
   wrote down:

   ```markdown
   🔀 **Merged `<kitchen.baseBranch>`** · a1b2c3d

   | File                        | Hunks | Kept |
   | --------------------------- | ----- | ---- |
   | `src/features/cart/cart.ts` | 2     | both |
   ```

2. Relabel by step 9's tier on the new head, as the hand-over does: `kitchen.labels.autoMerge`
   on a low, then step 11; `kitchen.labels.readyForHuman` otherwise.
3. Release the claim (`done`): edit its comment, take the label off — on a low, at the end of step 11.

**Anything still stopped → block:**

1. Pick a key: `area:slug`. Area is `code`, `infra`, or a key of `kitchen.humans.areas`.
   Same root cause → same
   key, on every PR it hits.
2. File the blocker on its issue. One issue a key holds the explanation, so the next
   `/unblock` picks that issue up and claims it, and no two agents fix one cause.
   `list_issues` (label `kitchen.labels.blocked`, open and closed, newest first). Keep the newest whose title
   is exactly what `node .claude/kitchen/scripts/blocked.mjs title <key>` prints:

   | Found  | Do                                                                                                                  |
   | ------ | ------------------------------------------------------------------------------------------------------------------- |
   | open   | add `#<pr>` to its `Blocks` bullet                                                                                  |
   | closed | reopen it, take `kitchen.labels.needsHuman` off, add `#<pr>` to `Blocks`, comment `🔁 **Back** · #<pr>` — a fix that did not hold |
   | none   | `issue_write` it: that title, label `kitchen.labels.blocked`, body from `blocked.mjs format` with `"blocks":"#<pr>"` |

   ```bash
   echo '{"key":"infra:session-up-timeout","stopped":"evidence","error":"session-up.sh: api server did not answer within 300s","tried":"READY_TIMEOUT=600 · BLOCKERS row","next":"find why Next never serves in the container","blocks":"#431"}' \
     | node .claude/kitchen/scripts/blocked.mjs format
   ```

   One line a bullet. No prose. `Next` is the one thing the next agent does first. A stop at
   evidence because the stack cannot produce a state the ticket needs names in `Next` what the
   stack lacks and what supplies it — a fixture row, a stub or test seam for the service, or the
   criterion a person drops — as the row in [`BLOCKERS.md`](../../BLOCKERS.md) for that state does.

3. Point the PR at it. A phase already posted a `🧱 **Blocked**` comment that
   `blocked.mjs parse` reads → edit it (`update_issue_comment`) to add
   `- **Issue** · #<issue>`. Otherwise post `blocked.mjs format`'s comment with
   `"issue":"#<issue>"` and no `blocks`. A `🧱` comment with no `Issue` is not handed over:
   `/unblock` follows the issue, not the comment.
4. Body: the [needs-a-human block](../../kitchen/docs/pr-format.md#the-needs-a-human-block) at the very
   top — a row for every `blocked` cell, its `Needs` ending in `#<issue>`, a row for any urgent ask, and an `Unblock`
   table where only a person can act — then the Aim and the tables, `Next · /unblock`. Label it `kitchen.labels.blocked`,
   take off `kitchen.labels.readyForHuman` and `kitchen.labels.autoMerge`. A conflict that cannot be resolved takes the `merge` area.
   A PR this run never read, a stalled one, has no tables to keep: its body is the blocked
   block, then `Next · /unblock`, then the body as it stood.
5. Release the claim (`blocked`, with the issue): edit its comment, take the label off. `.claude/kitchen/scripts/dev-server.sh stop`, which stops Metro and the `stack` adapter's API.

Done when the PR is handed over — `kitchen.labels.autoMerge`, gone on to step 11, or `kitchen.labels.readyForHuman` —
with a `🎚️ **Risk**` comment naming its head and the evidence table in its body or, after a hand-back, a `🔀` comment on the current head. Otherwise it is labelled
`kitchen.labels.blocked`, opens its body with the needs-a-human block, and carries a comment `blocked.mjs parse`
reads back whose `Issue` names an open `🧱 <key>` issue listing this PR under `Blocks`.

## 11. Merge

A PR labelled `kitchen.labels.autoMerge`, from step 10 or step 1's `mergeable` group. The tier
was the agent's judgement; the merge trusts only what the base branch's copy of the rules reads off GitHub, so a
PR that edits `risk.mjs` cannot pass its own gate.

1. Read it fresh: `pull_request_read` `get` and `get_check_runs`; `get_comments` with
   `perPage` 100, page after page until one comes back short, since the verdict is among the
   newest; and `issue_read` `get` on the issue its `Closes #<n>` names. Write
   `.claude/tmp/pr.json` with these fields, values exactly as the tools returned them:

   ```json
   {
     "pr": { "head": { "sha": "…", "repo": { "full_name": "…" } },
             "base": { "repo": { "full_name": "…" } },
             "user": { "login": "…" }, "labels": ["…"], "body": "the whole body" },
     "comments": [{ "user": { "login": "…" }, "body": "its first line is enough" }],
     "ticket": { "number": 69, "user": { "login": "…" } }
   }
   ```

   The body goes in whole: the gate reads its `Closes` line and its checks table. Note the head
   SHA, `head.ref` and `mergeable_state`.
2. Run the base branch's rules against it:

   ```bash
   git fetch origin <kitchen.baseBranch> <head.ref>
   rm -rf .claude/tmp/base-rules && mkdir -p .claude/tmp/base-rules
   git archive origin/<kitchen.baseBranch> .claude | tar -x -C .claude/tmp/base-rules
   RISK=.claude/tmp/base-rules/.claude/kitchen/scripts/risk.mjs
   git diff --numstat --no-renames origin/<kitchen.baseBranch>...<head-sha> > .claude/tmp/numstat.txt
   node "$RISK" gate .claude/tmp/numstat.txt < .claude/tmp/pr.json
   ```

   The archive carries `risk.mjs` and `kitchen.json` together, and `risk.mjs` reads the
   `kitchen.json` beside it, so the floors are the base branch's too.

3. Act on the first row that matches, top down. A **required check** is one the base branch's ruleset
   requires — `lint`, `format`, `typecheck`, `test`, `migrations`. Any other run on the head, an
   evidence `shoot` among them, is not one; a `skipped` required check counts as passed.

   | Prints                         | And                                         | Do                                                                                                   |
   | ------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
   | `hold · no risk review on …`   | —                                           | take `kitchen.labels.autoMerge` off: the head moved past its verdict, and a later tick drives it    |
   | any other `hold ·`             | —                                           | swap `kitchen.labels.autoMerge` for `kitchen.labels.readyForHuman`, set `Next · merge`: a person merges what the base branch's rules hold |
   | `merge ·`                      | a required check failed, or was cancelled   | take `kitchen.labels.autoMerge` off: it is unfinished, and a later tick drives it                    |
   | `merge ·`                      | a required check queued or in progress      | nothing: it stays `kitchen.labels.autoMerge`, and a later tick's step 1 takes it once it is `clean` |
   | `merge ·`                      | `mergeable_state` is `clean` or `unstable`  | `merge_pull_request`, `merge_method` `merge`, `expectedHeadSha` the head SHA                          |
   | `merge ·`                      | anything else — a draft, `unknown`          | nothing this tick: step 10 marks it ready, and GitHub settles `unknown` on a later read              |

   `merge_pull_request` refused because the head moved → this step again from item 1, once.
   Refused for any other reason → swap `kitchen.labels.autoMerge` for `kitchen.labels.readyForHuman`, set `Next · merge`.

4. Release the claim (`done`): edit its comment, take the label off. `rm -rf .claude/tmp/base-rules .claude/tmp/pr.json .claude/tmp/numstat.txt`.

Done when the PR is merged on the SHA its verdict names, or still `kitchen.labels.autoMerge` with a check
running, or relabelled per the table, and the claim is released.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, have every blocker already met, and its first section is
where to look for the rest. A blocker nothing there fixes is step 10's block — never a silent
stop.

## Output

One [`receipt.mjs`](../../kitchen/scripts/receipt.mjs) line:

```
done · 3 found, 2 fixed, 1 open · https://github.com/<kitchen.repo>/pull/431
blocked · infra:shoot-workflow-timeout · https://github.com/<kitchen.repo>/issues/612
```

A hand-back counts conflicted hunks, every one fixed, and links its `🔀` comment:

```
done · 2 found, 2 fixed, 0 open · https://github.com/<kitchen.repo>/pull/431#issuecomment-2
```

A run that took a `mergeable` PR and went straight to step 11 found nothing to fix:

```
done · 0 found · https://github.com/<kitchen.repo>/pull/431
```

Or, when step 1 found nothing, `none · no PR to drive`.
