---
name: unblock
description: Pass over every `🧱 <key>` blocker issue a blocked PR (`kitchen.labels.blocked`) names — claim it, one subagent per issue fixes what an agent can, the owner is tagged on that same issue for what it cannot, and each freed PR goes back through /drive-pr-green. Stops at once when nothing is blocked. Use when /find-work reaches it, or when PRs are piling up blocked.
---

# Unblock

Eats PRs labelled `kitchen.labels.blocked` whose `🧱 **Blocked**` comment names a `🧱 <key>`
issue, written by [`/drive-pr-green`](../drive-pr-green/SKILL.md) step 10. The issue is the unit of work: one
root cause, every PR it blocks, and the claim that keeps a second agent off it. Leaves each PR
resumed, or its issue waiting on a person. The repo is `kitchen.repo`. Never merge.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

Who gets tagged lives in [`.claude/kitchen.json`](../../kitchen.json)'s `humans`: an area → a
GitHub handle, with `default` for the rest. Edit that key to change who is asked.

## 1. List

Given an `unblock ·` line from [`/find-work`](../find-work/SKILL.md), take it. Given none, run
[`next-work.mjs`](../../kitchen/scripts/next-work.mjs) `unblock`:

```bash
node .claude/kitchen/scripts/next-work.mjs unblock
```

Do not list the PRs or read their comments yourself.

The script reads every PR labelled `kitchen.labels.blocked` and the `🧱 <key>` issues whose
`Blocks` bullet names it — an open one before a closed one — and groups the PRs by issue. One
issue blocking five PRs is one job. A blocked PR no `🧱` issue names waits while a PR its
`Depends on:` line names is open; otherwise it is an **orphan**, re-filed in step 2.

`none · nothing blocked` → output it and **stop**. That is the normal day.

Done when the `unblock ·` line is in hand, or the run has stopped at `none`.

## 2. Sort

The line is the sort: one entry an issue, `#<issue> <key> → #<pr> …`, under the first bucket
that matches:

| The entry                                                              | Bucket                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| a closed issue                                                         | **resume** — fixed, or the human did their bit → step 6    |
| open, labelled `kitchen.labels.needsHuman`                             | **wait** — do nothing, ping nobody                         |
| open, labelled `kitchen.labels.claimed` and touched in the last 90 min | **taken** — another agent has it; leave it                 |
| open                                                                   | **fix** → steps 3 and 4                                    |
| a blocked PR no issue names                                            | **orphan** — below                                         |
| an open issue, not labelled for a human, that blocks no open PR        | **stale** — below                                          |

Each **stale** issue: comment `✅ **Fixed** · every PR it blocked is closed or merged`, close it
as `completed`.

Each **orphan** PR: `pull_request_read` `get_comments`, take its newest `🧱 **Blocked**` comment and
`blocked.mjs parse` it.

| Found                                  | Do                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| a comment naming an `Issue`            | add `#<pr>` to that issue's `Blocks` bullet; it lost the PR, and the next run sorts it           |
| a comment with no `Issue`              | file it, per [`/drive-pr-green`](../drive-pr-green/SKILL.md) step 10's items 2 and 3              |
| no `🧱 **Blocked**` comment             | what it depended on has merged, or a person set the label: resume it in step 6                   |

Nothing in fix, resume, orphan or stale → the script printed
`none · all waiting on humans or claimed`; output it and stop.

Done when every entry sits in one bucket, every stale issue is closed, and every orphan is
filed, linked or queued for step 6.

## 3. Claim

A claim is two things: the label `kitchen.labels.claimed` on the issue, which is what
`next-work.mjs` reads, and a comment, which settles a race and says how the run ended. Run
`date -u +%Y-%m-%dT%H:%MZ` before every comment this skill writes with a time in it — this
claim, each edit to it, its release — and use that output. This reading is `now` for the
checks in this step.

On each **fix** issue, add `kitchen.labels.claimed` — `issue_write` replaces the whole set, so pass
every label it carries plus that one — and comment, keeping the id:

```
🤖 **Claimed** · #612 · 2026-09-27T08:45Z
```

Re-read the comments and run [`claims.mjs`](../../kitchen/scripts/claims.mjs) `classify` on them
with `{"nowFromId":<your comment id>, "items":{…}}`, so `now` is GitHub's clock, read off the claim
you just posted. The `winner` is the lowest live claim id.

- Not yours → edit your own comment through `update_issue_comment` to
  `🤖 **Released** · #<n> · lost to <winning comment id> · <ts>` (written by `claims.mjs release`),
  leave the label on — it is the winner's — and move that issue to **taken**.
- Yours, and the comments hold two or more `🔁 **Back**` — two fixes did not hold → move it to
  **escalate**: no fixer, straight to step 5.
- Yours → it stays in **fix**.

A finished claim reads `🤖 **Released** · #<n> · done · <ts>`; one this run could not fix reads
`🤖 **Released** · #<n> · blocked · #<n> · <ts>`. Releasing a claim you won, wherever this skill
says so, is both: edit the comment to its form, and take `kitchen.labels.claimed` off the issue.
Edit yours — its `date -u` time — before the fixers go out and after they return: each edit moves
the issue's `updated_at`, which keeps the label live, and a claim not edited for 90 minutes reads
expired.

Done when every issue left in **fix** or **escalate** carries this run's claim and label, and no
earlier claim that still counts.

## 4. Fix

One [`blocker-fixer`](../../agents/blocker-fixer.md) agent per **fix** issue, all in **one
message**. Hand each:

- the issue number, its key, and every PR it blocks — the PRs step 1's line grouped under it
- the current time, from `date -u +%Y-%m-%dT%H:%MZ` run just now
- this instruction, verbatim, with `<kitchen.baseBranch>` filled in:

  > Fix the blocker issue you were handed so every PR it blocks can pass /drive-pr-green.
  > Read the issue and its comments first — a `✅ **Fixed**` there is a fix that did not
  > hold. Then search `.claude/BLOCKERS.md` and `.claude/kitchen/docs/BLOCKERS.core.md`,
  > then look it up yourself with their connectors
  > section — the error tracker, the database and deploy hosts, GitHub job logs. Fix on the PR's branch when the
  > cause is in that PR; open a draft PR off `<kitchen.baseBranch>` when the cause is shared, its body
  > ending `Closes #<the blocker issue>` so merging it resumes every PR the issue blocks. Run the repo's
  > gates before any push. Add the blocker's row to `.claude/BLOCKERS.md`, or to the core
  > file when any Expo repo would meet it, in the same commit as the fix. Return one line and nothing else:
  > `fixed · <key> · <commit or PR url>` or
  > `human · <key> · <area> · <the one thing a person must do>`.

A fix that only works once a new PR merges is `human · <key> · merge · Merge #<n>`.

A last line that is neither form counts as `human`, with its text as the thing to do.

Each `fixed` → comment on its issue `✅ **Fixed** · <commit or PR url>` → close it as
`completed` → release the claim: edit its comment, take the label off.

Done when every subagent has returned one line, and every `fixed` issue is closed with its
`✅` comment.

## 5. Ask a human

For each `human` line, and each **escalate** issue — its thing to do is `two fixes did not
hold: fix it by hand, or say what an agent should try` — on its blocker issue, never a second issue:

1. Comment:

   ```markdown
   🙋 @<owner> — agents tried and cannot fix this.

   - **Do** · <the one thing, from the subagent's line>
   - **Then** · close this issue. The next /unblock resumes every PR under `Blocks`.
   ```

   The handle is `node .claude/kitchen/scripts/blocked.mjs owner <key>`. Never hard-code one.

2. Label it `kitchen.labels.needsHuman`. Release the claim: edit its comment, take the label off.

Done when every `human` issue is open, labelled `kitchen.labels.needsHuman`, carries a `🙋` comment tagging
its owner, and holds no claim of this run's.

## 6. Resume

Every PR whose blocker issue is closed: the **resume** bucket (step 2), every **orphan** with no
`🧱 **Blocked**` comment, plus every PR under an
issue step 4 closed. Oldest first, **at most three** a run — the rest wait for the next tick.

For each, one at a time, in this session:

1. Remove the `kitchen.labels.blocked` label. Drop the body's
   [needs-a-human block](../../kitchen/docs/pr-format.md#the-needs-a-human-block) rows that name the
   closed issue, with `update_pull_request`, and read the body back — `/drive-pr-green`
   rewrites the body from there.
2. Run [`/drive-pr-green`](../drive-pr-green/SKILL.md) `<pr>` and keep its receipt.

Blocked again with the same key → that fix did not hold. `/drive-pr-green` reopens the
issue, and the next run's fixer reads the `✅` it left.

Done when each resumed PR has a receipt, or no PR was due, and no resumed PR's body carries a
needs-a-human block row naming a closed `🧱` issue.

## 7. Report

One line a PR touched, nothing else:

```
#431 · resumed · done · 0 found · <kitchen.labels.readyForHuman>
#445 · waiting · #612 (@<owner>)
#447 · taken · #613
#452 · resumed · blocked · code:missing-testid · #614
#460 · orphan · filed #615
#931 · stale · closed
```

Done when every PR from step 1 has a line.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md) have every blocker met so far and where to look for the
rest. A blocker no agent can clear is step 5 — a tagged person on its issue, never a silent
skip.

## Output

The report from step 7. Or `none · nothing blocked` / `none · all waiting on humans or claimed`.
