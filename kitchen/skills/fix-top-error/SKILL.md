---
name: fix-top-error
description: Take the most severe unresolved issue in the error tracker and drive it to a fix. Use when the user asks what is breaking in production, or for the daily error sweep.
---

# Fix top error

One run, one issue: error tracker → a merged-ready PR. Built to run unattended on a daily
schedule, so every step below either produces a durable artefact or exits saying why.

**Most runs should stop at [Stop](#2-stop).** A daily sweep over a healthy week finds nothing
worth a PR, and reporting that in one line is the job done — an agent that always finds
something to fix is one that has stopped reading the bar.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.
GitHub is `kitchen.repo`, base `kitchen.baseBranch`.

The tracker is reached only through the `errors` adapter that `kitchen.adapters.errors.use`
names. What the project's events carry, and which issues its sweep never takes, are in
the **error doc**, the file `kitchen.adapters.errors.doc` names. A project without one skips
nothing but what the adapter's `guide` says to.

## 1. Pick

```bash
node .claude/kitchen/scripts/adapter.mjs errors top
```

The adapter's JSON says `enabled`. When it is `false`, this project has no error tracking and
the Fix loop is off: output `none · <reason>` with the adapter's `reason` as it is, and stop —
before any claim, comment, ticket or branch. `/find-work` reads that line as a skill with
nothing to take.

Otherwise it carries `pins` and `window`, and `guide` names the document that holds the calls.
Run [`/search-errors`](../search-errors/SKILL.md) steps 1–2 first: the connection can start in
the wrong project, and a search there reads as a quiet week. Then follow the guide's **top**.

Rank on **users affected first, occurrences second** — one crash hitting 400 people beats a
loop firing 40,000 events at one person. Then apply, in order:

1. Drop what **What the sweep skips** in the error doc
   lists: the pipeline's own smoke test, and the buckets that are not a fault in this repo.
2. Drop anything already picked up, per **Taken** below.
3. Prefer `fatal` over `error` over `warning` at comparable reach — `fatal` means the app hit
   the boundary or died, which a user felt.

Done when one tracker issue is in hand with its users, level and `last_seen`, or the run has
stopped at `none · <reason>` because `enabled` was `false`, or the list and the events both came
back empty.

**An empty list is not evidence of a quiet week.** The guide says how to confirm it against the
events themselves. Rows there but nothing in the list → work from those, and say the list was
stale.

### The bar

A run costs a PR's worth of review attention, so an issue earns one only if **all** hold:

| Test                                                                                             | Why                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `status` is `active`                                                                             | `resolved` and `suppressed` are already someone's decision               |
| `last_seen` within 48 hours                                                                      | a fault that stopped days ago is likely fixed by a release since         |
| `impact.users` ≥ 2, **or** level is `fatal`, **or** `severity` is `high`/`critical`              | one occurrence on one person is as likely a developer testing as a fault |

Run `date -u +%Y-%m-%dT%H:%MZ` now: 48 hours is counted back from that output, never from a recalled date.

Below the bar is not "fix it anyway, quietly". It is **Stop**.

### Taken

An issue is someone else's when any of these holds — check before claiming, not after:

- it carries an external reference whose GitHub issue is open, or whose PR is open
- its linked GitHub issue carries a live claim: [`claims.mjs`](../../kitchen/scripts/claims.mjs)
  `classify` on its comments, `"window":"ticket"`, reads `taken` (below)
- it is assigned

Take the next one down instead. **Never adopt an open PR's branch** — that run's window
outlives any claim you can read, so an expired claim is no evidence it died.

## 2. Stop

Every run ends in exactly one of these. A run that finds nothing is a **success**, reported
in one line — never widen the window, drop the bar, or pick something below it to have
something to do.

| What you found                                         | Say                                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No exception rows at all, in the list or the events    | Nothing is arriving. That is a pipeline failure or a quiet week and you cannot tell which — say so, and name the smoke test's command in the error doc as what settles it |
| Only the smoke test's fingerprint                      | Pipeline alive, no faults reported. This is the good outcome                                                                                                                    |
| Rows, none clears **the bar**                          | Name the top one, its users and level, and which test it failed                                                                                                                 |
| Everything clearing the bar is **Taken**               | Name each and what holds it — the issue, the PR, or the claim                                                                                                                   |

Then exit. Do not open a ticket, do not start a branch.

Done when the run has either exited with one of those four lines, or has an issue clearing
the bar and not Taken.

## 3. Claim

One run, one issue. Claim on its GitHub issue — creating one first if none exists, per
**Open the ticket** — the same way [`/pick-up-ticket`](../pick-up-ticket/SKILL.md) does. Run
`date -u +%Y-%m-%dT%H:%MZ` before every comment this skill writes with a time in it — this
claim, each edit to it, its release — and use that output. This reading is `now` for the
checks in this step. Add `kitchen.labels.claimed` to the issue — `issue_write` replaces the whole
set, so pass every label it carries plus that one — so the build loop's `next-work.mjs` leaves it
alone, and comment:

```
🤖 **Claimed** · error `<fingerprint>` · 2026-08-22T17:41Z
```

Keep the id. Re-read the comments and run `claims.mjs classify` on them with
`{"nowFromId":<your comment id>,"window":"ticket","items":{…}}`, so `now` is GitHub's clock, read off
the claim you just posted: the `winner` is the lowest live claim id. Edit your claim — its
`date -u` time — as you go on, before each agent and after it returns; one not edited for three
hours reads expired. Lost → edit yours through `update_issue_comment` to the released form below,
leave the label on — it is the winner's — and take the next issue down, or **Stop** if none is
left. Releasing a claim you won is both: edit the comment to its form, and take
`kitchen.labels.claimed` off.

```
🤖 **Released** · error `<fingerprint>` · lost to <winning comment id> · <ts>
```

`claims.mjs release` writes all three forms with the subject `error <fingerprint>`: `done`,
`blocked · #<issue>` (when `/drive-pr-green` blocked the PR) and `lost to <id>`. `classify`
reads the part after the subject, so the subject's wording does not matter.

Two runs can reach the same tracker issue before either has a GitHub issue to claim on. After
creating one, search again by fingerprint: two issues for one fingerprint means the lower
number wins, and the loser closes its own as a duplicate of it.

Done when the claim comment is posted and its id is held, or the claim was lost and step 1
runs again.

## 4. Read it

Follow the guide's **Read one issue**.

The events carry what the repo attaches at capture time, which
**Reading the events** in the error doc
explains: read it before opening a file. Its operation and screen properties together name the
file, and its source property says which capture point fired and so which end of the app to
start from.

Done when the operation and screen name a file you have opened.

**Stack frames may be unsymbolicated.** A minified frame is a hint, not a location, so lean on
the properties above.

## 5. Open the ticket

Search for an existing issue before creating one (`search_issues`, the fingerprint and the
exception type as the query). If none, `issue_write` a `bug` with the exception type and value
as the title, the events' properties as a table, the affected-user count, and the tracker's
issue URL.

Link it back **before starting work**, because that reference is what makes the issue
**Taken** for every other run: the guide's **Link a ticket back**. A tracker without one is
linked by the URL in the ticket alone, and the claim in step 3 is then all that holds it.

Then claim it per [Claim](#3-claim), and only then open a branch.

Done when the GitHub issue exists, carries the property table, and the tracker's issue points
at it, or the guide has no way to link and the ticket carries the tracker's URL.

## 6. Fix it

Hand the issue to `/implement`. Two rules specific to this loop:

- **Reproduce first, as a test.** An error tracking issue is a bug report from a user you
  cannot ask. A test that fails on `kitchen.baseBranch` and passes on the branch is the only
  proof the right thing was fixed — `/tdd` owns that.
- **Fix the fault, not the report.** Wrapping the throw site in a `try/catch` makes the
  tracker's issue stop counting and the product stay broken. If the fault is genuinely
  upstream and unfixable here, say so on the GitHub issue and **Suppress an issue** per the
  guide, with the reason — never `resolved`.

Done when a test fails on `kitchen.baseBranch` and passes on the branch, or the fault is
suppressed with its reason.

## 7. Close the loop

Open a draft PR per [`pr-format.md`](../../kitchen/docs/pr-format.md) with
`Closes #<n>`, and its Aim written from the error issue: what users hit, and why it is worth fixing now. Leave the tracker's issue `active`: it is the fix's own evidence, and it should
go quiet on its own once the release carrying the fix is out. Say in the PR which release to
watch it on. Label it per [`pr-format.md`](../../kitchen/docs/pr-format.md#labels), and relabel on every later push or body write.

Then run [`/drive-pr-green`](../drive-pr-green/SKILL.md) `<pr>` in this session. It reviews,
fixes, shoots the evidence and hands over — or blocks the PR for
[`/unblock`](../unblock/SKILL.md). Then release the claim on the issue by edit — a live
claim on the ticket keeps every later `/drive-pr-green` off the PR:

```
🤖 **Released** · error `<fingerprint>` · done · <ts>
```

Done when the PR is open, names the release to watch, `/drive-pr-green` has returned its
receipt, and the issue claim is released.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into, each with the steps
out. Stopping is for a blocker with no row there.

## Output

One line where the run stopped short of a fix: `none · <reason>` when the adapter is off, or
which of **Stop**'s four it was. Otherwise `/drive-pr-green`'s receipt, for a PR naming the
release to watch the tracker's issue go quiet on.
