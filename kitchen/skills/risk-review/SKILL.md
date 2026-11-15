---
name: risk-review
description: Read one PR's diff and decide its risk tier — low is merged by the loop on green, medium and high wait for a person — pinned to the head commit, posted on the PR, labelled. Use as /drive-pr-green's last phase, after every push, or when the user asks how risky a PR is or whether it needs a human.
---

# Risk review

One PR in, at its head commit. One verdict out: `low`, `medium` or `high`, posted as a
`🎚️ **Risk**` comment naming that commit, and the labels that say it
(`kitchen.labels.riskLow`, `kitchen.labels.riskMedium`, `kitchen.labels.riskHigh`). The repo is
`kitchen.repo`, base `kitchen.baseBranch`. Never merge: `/drive-pr-green` step 11 does, on the
commit this verdict names and only once the base branch's copy of
[`risk.mjs`](../../kitchen/scripts/risk.mjs) agrees.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

The change sets the tier, not the author. Two questions decide it, asked in order, and neither
can lower what the paths already say.

| Tier   | Who merges                        | The change                                                                  |
| ------ | --------------------------------- | --------------------------------------------------------------------------- |
| low    | the loop, once CI is green on it  | docs, copy, tests, tooling, a fix to one screen, additive and reached by no existing path |
| medium | a person                         | ordinary product behaviour a user already meets, a sensitive area            |
| high   | a person, who reads the diff     | money, auth, the schema, the gate itself, CI, anything that is hard to undo  |

## 1. Read the change

`pull_request_read`: `get`, `get_files`, `get_comments`. Note the head SHA, all forty
characters, and `head.ref`. Read the ticket its `Closes #<n>` names. Check the branch out at
that SHA, then read the floor with the base branch's copy of the rules, never the branch's — a PR that
edits them would otherwise grade itself:

```bash
git fetch origin <kitchen.baseBranch> <head.ref>
rm -rf .claude/tmp/base-rules && mkdir -p .claude/tmp/base-rules
git archive origin/<kitchen.baseBranch> .claude | tar -x -C .claude/tmp/base-rules
RISK=.claude/tmp/base-rules/.claude/kitchen/scripts/risk.mjs
git diff --numstat --no-renames origin/<kitchen.baseBranch>...<head-sha> | node "$RISK" floor
rm -rf .claude/tmp/base-rules
```

It prints the **floor**: the lowest tier the paths allow, then each reason. The floor is
[`risk.mjs`](../../kitchen/scripts/risk.mjs)'s call, not a reading of the file list, and
`/drive-pr-green` recomputes it the same way before it merges.

Done when the head SHA, the ticket and the printed floor are in hand.

## 2. Pick the tier

Read the diff. Pick the row below that fits its riskiest hunk, and take the higher of that row
and the floor.

| The diff                                                                                     | Tier   |
| -------------------------------------------------------------------------------------------- | ------ |
| prose, comments, tests alone, a `kitchen.flows` flow, fixtures                                   | low    |
| user-facing copy, a style or layout change on one screen, evidence showing it               | low    |
| a new screen or component no existing route reaches yet, or one behind a flag that is off   | low    |
| a bug fix inside one module whose test went red then green                                  | low    |
| a change to what an existing screen does, not just how it looks                             | medium |
| a tRPC procedure's input or output changes, or a query it runs                              | medium |
| caching, notifications, analytics events, onboarding, the quiz or study-list logic          | medium |
| a pattern other code will copy: a new module boundary, a shared hook, a new dependency     | medium |
| reads or writes another user's data, or deletes anything                                     | high   |
| sends something to a user outside the app — email, push — or charges them                   | high   |

Done when the tier is picked, it is no lower than the floor, and one line says which row.

## 3. Ask whether a person is needed anyway

A low tier still goes to a person if any row here answers **yes**. Each yes raises the tier to
medium; one marked high raises it to high.

| Question                                                                                                | Yes means |
| ------------------------------------------------------------------------------------------------------- | --------- |
| Does the body's checks table count anything `open` or `blocked`?                                         | medium    |
| Does the gaps table accept a deviation — a new `DEVIATIONS.md` row a person signs by merging?            | medium    |
| Does the ticket ask for a judgement call — pricing, wording a person chose, a product trade-off?         | medium    |
| Does behaviour the ticket names go untested, by a unit test or a `checks/` file under `kitchen.flows`?                | medium    |
| Does input from a user or the network reach SQL, HTML, a shell, a URL or a file path unescaped?          | high      |
| Does it add a secret, a new external host, or loosen a permission check?                                 | high      |
| Would a revert fail to undo it — data written, a migration applied, a message sent?                      | high      |

Done when every question has a yes or no, and the tier is the higher of step 2's and every yes.

## 4. Post the verdict

Comment on the PR through `add_issue_comment` — it carries no shots. The first line is exactly
what this prints, nothing before it:

```bash
RISK=.claude/kitchen/scripts/risk.mjs
node "$RISK" heading <tier> <head-sha>
```

Then one table, per [`pr-format.md`](../../kitchen/docs/pr-format.md#comments): the floor's
reasons, step 2's row, and each step-3 `yes`. A `no` is not a row.

```markdown
🎚️ **Risk** · medium · 3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a

| Reads              | Tier   | Because                                  |
| ------------------ | ------ | ---------------------------------------- |
| floor              | low    | no sensitive path                        |
| diff               | low    | layout change on the review screen       |
| untested behaviour | medium | the header menu's tap has no check       |

Next · a person merges
```

`Next` reads `merges on green` for low, `a person merges` otherwise.

Done when the comment is posted and `node "$RISK" parse` reads its body back
as the tier and the head SHA.

## 5. Label it

```bash
RISK=.claude/kitchen/scripts/risk.mjs
node "$RISK" labels <tier> <every label the PR carries now>
```

It prints the whole set: the old risk label out, the new tier's in. A PR already handed over —
`kitchen.labels.readyForHuman` or `kitchen.labels.autoMerge` — is handed over again by the new
tier: `kitchen.labels.autoMerge` on a low, `kitchen.labels.readyForHuman` otherwise. One not handed over gains neither; `/drive-pr-green` hands
it over. `issue_write` (`update`, `labels`) with that set.

Done when the PR's labels are exactly what that printed.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into, each with the steps out. A
diff that cannot be read or checked out, after that, is `blocked` with its reason — never a
guessed tier. When in doubt between two tiers, take the higher: a person reading a low change
costs minutes, and a high change merged unread costs a revert.

## Output

One line, which [`risk.mjs`](../../kitchen/scripts/risk.mjs) `parseReceipt` reads:

```
low · merges on green · https://github.com/<kitchen.repo>/pull/431#issuecomment-7
medium · a person merges · https://github.com/<kitchen.repo>/pull/431#issuecomment-7
blocked · head would not check out · https://github.com/<kitchen.repo>/pull/431
```
