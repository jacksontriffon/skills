---
name: pick-up-ticket
description: Take the highest-value ticket off the GitHub backlog, build it in a subagent, open the PR, then drive it green with /drive-pr-green. Use when /find-work reaches it, or when the user wants a ticket built without the rest of the loop.
---

# Pick up ticket

One run, one ticket: an open issue → PR handed over (`kitchen.labels.autoMerge` or
`kitchen.labels.readyForHuman`), or PR `kitchen.labels.blocked` for [`/unblock`](../unblock/SKILL.md).
GitHub is the only state. The repo is `kitchen.repo`, base `kitchen.baseBranch`. Other agents
work this backlog too. Never merge.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

An issue is pickable unless something below drops it. No label opts a ticket in.

## 1. Pick

Given a `ticket ·` line from `/find-work`, or a person's number, take it.

Given none, run [`next-work.mjs`](../../kitchen/scripts/next-work.mjs) `ticket`, adding
`--skip <n>` for each issue this run already lost:

```bash
node .claude/kitchen/scripts/next-work.mjs ticket
```

Do not list or read the issues yourself. It leaves out issues a label holds for a person or a
decision, epics, issues an open PR names or whose work already landed on `kitchen.baseBranch`,
issues blocked by open work, and issues with a live `kitchen.labels.claimed`; it ranks
`kitchen.labels.urgent` first, then by how many open issues each blocks.
[`next-work.test.mjs`](../../kitchen/scripts/next-work.test.mjs) is the full rule set, and
`next-work.mjs audit` lists the left-out issues no one is asked about.

`none ·` → output `none · backlog empty` and stop.

Done when one issue number is in hand, or the run has stopped at `none`.

## 2. Claim

A claim is two things: the label `kitchen.labels.claimed` on the issue, which is what
`next-work.mjs` reads, and a comment, which settles a race and says how the run ended. Run
`date -u +%Y-%m-%dT%H:%MZ` before every comment this skill writes with a time in it — this
claim, each edit to it, its release — and use that output. This reading is `now` for the
checks in this step.

Add `kitchen.labels.claimed` to the issue — `issue_write` replaces the whole set, so pass every
label it carries plus that one — and comment on it, keeping the id:

```
🤖 **Claimed** · #128 · 2026-09-27T08:45Z
```

Re-read the comments and run [`claims.mjs`](../../kitchen/scripts/claims.mjs) `classify` on them
with `{"nowFromId":<your comment id>, "window":"ticket","items":{…}}`, so `now` is GitHub's clock,
read off the claim you just posted. The `winner` is the lowest live claim id.

| Read                                                                  | Do                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| not yours                                                             | edit your comment to the `lost` form below, leave the label on — it is the winner's — step 1 with `--skip <n>` |
| yours, and classified again without your claim it reads `stalled` — its last three runs all stopped | do not build it: post `blocked.mjs format`'s comment with key `infra:ticket-stalled`, `Tried` the reasons, `human` what `blocked.mjs owner infra:ticket-stalled` prints; add `kitchen.labels.needsHuman`; release `blocked`; output `blocked · infra:ticket-stalled · <issue url>`; stop |
| yours                                                                 | go on                                                                                                 |

A claim says how it ended in one of three forms, written by `claims.mjs release`:

| Ends                                | The claim reads                                           |
| ----------------------------------- | --------------------------------------------------------- |
| the work is done                    | `🤖 **Released** · #<n> · done · <ts>`               |
| the run is blocked                  | `🤖 **Released** · #<n> · blocked · #<issue> · <ts>` |
| losing the race above               | `🤖 **Released** · #<n> · lost to <winning id> · <ts>` |

Releasing a claim you won, wherever this skill says so, is both: edit the comment to its form,
and take `kitchen.labels.claimed` off the issue.

Edit your claim — its `date -u` time — before dispatching each agent and after it returns: that
edit is the heartbeat, and it keeps the label live, since every edit moves the issue's
`updated_at`. A claim not edited for three hours reads expired, and the next run takes the
ticket.

Done when the claim is posted, the label is on, and the comment's id is held — or the run has
stopped.

## 3. Reconcile the database

```bash
git checkout <kitchen.baseBranch> && git pull
node .claude/kitchen/scripts/adapter.mjs db pending
```

That prints SQL: the `db` adapter's `pending` (`kitchen.adapters.db`).

Run it through the database connector's `execute_sql`, then `node .claude/kitchen/scripts/adapter.mjs db apply <tag>` for each tag it returns,
oldest first, per the db adapter's [README](../../kitchen/adapters/db/README.md#apply).

Done when `pending` returns no rows through `execute_sql`.

## 4. Build

One foreground [`implementer`](../../agents/implementer.md) agent running
[`/implement`](../implement/SKILL.md).
Hand it the skill, the issue, and a branch name in `kitchen.conventions.branch`'s shape.

It returns one [`receipt.mjs`](../../kitchen/scripts/receipt.mjs) line.

| Receipt    | Do                                                                           |
| ---------- | ---------------------------------------------------------------------------- |
| `done`     | step 5                                                                       |
| `findings` | step 5 — what is open rides into `/drive-pr-green`'s fix lap                 |
| `blocked`  | nothing was built, so there is no PR to unblock — ask a human on the issue ↓ |

On `blocked`: post `blocked.mjs format`'s comment on the issue, its `human` field set to
what `node .claude/kitchen/scripts/blocked.mjs owner <key>` prints (the `kitchen.humans` handle
for the key's area), its `Next` ending `then remove kitchen.labels.needsHuman and the loop builds
it again` with the label's name filled in — nothing else brings the ticket back — add
`kitchen.labels.needsHuman`, release the claim (edit its comment, take the label off), output the receipt, stop.

Done when the branch has the build commit, or the issue reads `kitchen.labels.needsHuman` with a
`🧱 **Blocked**` comment tagging its owner.

## 5. Open the PR

Push the branch. Open a **draft** PR:

- title in `kitchen.conventions.prTitle`'s shape
- body per [`pr-format.md`](../../kitchen/docs/pr-format.md): the Aim — why the ticket
  exists, in two sentences at most — and the unblocks table from the ticket's GitHub links
  (none queued → no table), then the change table, checks table with build's receipt and five
  rows `pending`, `Next · /code-review`, `Closes #<n>`
- labels per [`pr-format.md`](../../kitchen/docs/pr-format.md#labels), plus `kitchen.labels.urgent` when the
  issue carries it, so `/drive-pr-green` ranks the PR the same way

Done when the PR is open and its labels match what `pr-labels.mjs` prints for it.

## 6. Drive it green

Run [`/drive-pr-green`](../drive-pr-green/SKILL.md) `<pr>` in this session. It reviews,
fixes, shoots the evidence and hands over — or blocks the PR for `/unblock`.

Then release the claim on the issue: `update_issue_comment` it to the `done` form above, and take `kitchen.labels.claimed` off it.

Done when `/drive-pr-green` has returned its receipt and the issue claim is released.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into, each with the steps
out, and where to look for the rest.

## Output

`/drive-pr-green`'s receipt line, or `none · backlog empty`.
