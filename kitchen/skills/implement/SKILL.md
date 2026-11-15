---
name: implement
description: Implement work that is already written down — a ticket, an issue, or a spec. Use when the user names one to build, or another skill dispatches implementation against one.
---

# Implement

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

Build what a ticket already describes. Every acceptance criterion goes **red then green**, or
is named `uncheckable` — the commit is not the deliverable, the pair of runs is.

`kitchen.repo`, base `kitchen.baseBranch` — the values the session's kitchen brief carries from
`.claude/kitchen.json`.

## 1. Route the ticket

Not every ticket handed here is build work.

| The ticket asks                             | Dispatch to                          |
| ------------------------------------------- | ------------------------------------ |
| does this feel right · what should this look like | [`/prototype`](../prototype/SKILL.md) |
| what is true, before a decision             | [`/research`](../research/SKILL.md)  |
| anything already decided                    | stay here                            |

Dispatch before writing anything. Those two skills carry their own capture and PR rules, and
those rules are what keep spike code and unresolved findings off the branch a PR opens against
`kitchen.baseBranch`.

Done when the ticket is either dispatched, or named as ordinary build work.

## 2. Write the check, and watch it go red

Take one acceptance criterion. Write the check that answers it **before** the code:

- logic → a unit test, at a seam [`/tdd`](../tdd/SKILL.md) agreed
- something on screen → a file under `kitchen.flows`'s `checks/` folder, which that folder's
  `README.md` explains

Run it. A check that is **green before the change** is blocked, not progress: it is testing
something else, or nothing. Keep its output — the failure is half of what this phase reports.

A criterion nothing can check is named `uncheckable`, with the reason, before you build it.

Commit the check while it is red. That commit is what freezes it:
`git diff <the red commit> HEAD -- <the check>` answers empty, or the check moved to fit the
implementation, which is a finding against itself.

Done when every criterion has a check that ran red, or is named `uncheckable` with its reason.

## 3. Build until it goes green

Write the code. Run the check again, and keep its output — the pass is the other half.

Report both runs, not the word "verified". Run typechecking as you go and the single test file
often; the full suite waits for step 6.

Done when every check from step 2 runs green, and both its runs' output is in hand.

## 4. Migrate

A diff touching the schema carries its migration, and the shared database carries it too,
before step 5 photographs anything against it. Generating, applying and checking a migration
is the `db` adapter's job (`kitchen.adapters.db`): `node .claude/kitchen/scripts/adapter.mjs db migrate --name <what_it_does>`
writes it and refuses anything but an **expand** — a contract is its own ticket — and `db pending` and
`db apply <tag>` print the SQL that checks and applies it. The rules are in the db adapter's
[README](../../kitchen/adapters/db/README.md#apply).

A diff touching no schema skips this.

Done when the migration is generated and applied and `db pending`'s SQL returns no rows — or
the diff touches no schema.

## 5. Evidence

A diff touching `kitchen.expo.appDir` opens the web build. Stand it up via
[`/verify-expo`](../verify-expo/SKILL.md), drive to what changed, and post per the
**Evidence** table in [`pr-format.md`](../../kitchen/docs/pr-format.md): the shot, or
`blocked` naming what stopped you — that table also carries what a native feature does and does
not excuse.

A diff touching nothing under `kitchen.expo.appDir` skips the build entirely. Say what you checked
instead.

This posts findings, never the Before/After pair: that is
[`/evidence`](../evidence/SKILL.md)'s, once per PR. Where the work has an issue but no PR yet —
as it does inside [`/pick-up-ticket`](../pick-up-ticket/SKILL.md) — the issue is where this lands.

Done when the shot, the `blocked`, or the line naming what you checked is posted.

## 6. Gate the commit

```bash
pm=<kitchen.packageManager>; $pm run lint && $pm run format && $pm run typecheck && $pm run test
```

Green here, not on trust. Then commit to the current branch, per
[`CLAUDE.md`](../../../CLAUDE.md)'s message format — the issue number in the scope, always.

Done when the suite is green and the work is committed.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into, each with the steps
out. Stopping is for a blocker with no row there.

## Output

A receipt — [`receipt.mjs`](../../kitchen/scripts/receipt.mjs)'s one line — and nothing else:

| Verdict    | What it takes                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `done`     | every criterion went red then green or is named `uncheckable`, the suite is green, the work is committed                                          |
| `findings` | committed, and something is still open — a check that will not go green, one that never went red, a criterion unbuilt. Each named on the issue   |
| `blocked`  | nothing to commit. Name the question and what you tried                                                                                           |
