# PR and comment format

The diff summarises itself. Write only what a reader cannot get from it.

Everything an unattended run writes to GitHub is a **table**. A body is tables, a comment is
one or two, and prose appears only as the Aim at the top of a body. That is not a style
preference: a reader scanning six PRs reads down a column, and a paragraph makes them read the
whole thing to find out whether it concerns them.

## The body

A body opens with the **Aim**, says what changed, shows the proof, lists the review, and ends
on what is left. In this order — and where design review left a gap, one more table under the
proof. Nothing sits above the Aim unless a person is needed, and then the
[needs-a-human block](#the-needs-a-human-block) does.

Every PR a loop opens for a ticket or an error — `/pick-up-ticket` and `/fix-top-error` — has
this body. A content-loop PR keeps the body its skill writes, and a lane PR is exempt, as
[Evidence](#evidence) says.

````markdown
**Aim** A new account's first look at its own progress is an empty profile. This fills it with
the avatar and the name, so the streak work has a screen to hang off.

| Unblocks | What it enables                 |
| -------- | ------------------------------- |
| #512     | edit the name from the profile  |
| #518     | streak counter on the profile   |

| What           | Before                          | After                           |
| -------------- | ------------------------------- | ------------------------------- |
| Profile screen | opens empty on a new account    | shows the avatar and the name   |
| Streak counter | resets when the app backgrounds | holds                           |

| What           | Design                                                      | Before                                                      | After                                                      | Steps                |
| -------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| Profile screen | `<img src="…/431/profile-design.png?raw=true" width="320">` | `<img src="…/431/profile-before.png?raw=true" width="320">` | `<img src="…/431/profile-after.png?raw=true" width="320">` | `pnpm drive <flow>`  |

| Screen         | Differs             | Aligned by                  |
| -------------- | ------------------- | --------------------------- |
| Profile screen | no edit button      | #512                        |
| Profile screen | no swipe to dismiss | accepted · DEVIATIONS.md D3 |

| Phase          | Found                     | Where                                    |
| -------------- | ------------------------- | ---------------------------------------- |
| build          | 0 found                   | #128 (comment 5741696904)                |
| code review    | 3 found, 2 fixed, 1 open  | #431 (comment 5741700001)                |
| content review | 0 found                   | #431 (comment 5741700002)                |
| evidence       | 0 found                   | #431 (comment 5741700003)                |
| design review  | 2 found, 1 fixed, 1 open  | #431 (comment 5741700004)                |
| risk review    | medium · a person merges  | #431 (comment 5741700005)                |

| Left before merge               | Who      |
| ------------------------------- | -------- |
| code review · 1 finding open    | agent    |
| the merge                       | a person |

Next · merge

Closes #69
````

**The Aim.** `**Aim**` and then at most two sentences: why the PR exists and what it solves, in
the product's terms, so a reader knows it was worth building without opening the ticket. Not
how it works, and not what changed — the change table says that. It is the one prose in a body.
`/pick-up-ticket` writes it from the ticket when it opens the PR, `/fix-top-error` from the
error issue, and every later phase leaves it as written.

**The unblocks table.** The next one to five pieces of work this PR makes possible, one row
each: `Unblocks` · `What it enables`, an `#n` link and a cell of eight words. The rows come from
GitHub and nowhere else — issues that name this ticket as blocked-by or, failing that, the next
open sibling tickets under the same parent spec, in the order `/pick-up-ticket` would take
them. A row nobody can open is a guess, so none is invented. Nothing queued → no table, and no
line saying so. `/drive-pr-green` reads the links again at hand-over, because a sibling may have
closed since the PR opened.

**The change table.** One row a change, read **across**.

- A row whose halves match is cut.
- A row is a change, never a stat or a decision. `Net · 219 deleted` is the diff talking.
- `Before` names the state, not the code: "opens empty", not "missing a dep".
- Sound code goes unlisted. Only what changed earns a row.
- A fact this diff does not change belongs to its own issue, named in `Next`.

The change table says what changed, and the Aim says why. A reason a reader cannot read off the
diff belongs in the Aim; a second line of it is the issue's, not the PR's.

**The evidence table.** The pair and its design, in the body, where a reviewer meets them
before anything else. Same shape [`/evidence`](../../skills/evidence/SKILL.md) posts as
its comment — `What` · `Design` · `Before` · `After` · `Steps` — repeated here rather than
linked, because a reviewer who has to open a comment to see whether the change works is a
reviewer who reads the diff instead.

`Design` sits first so the eye goes design → before → after. It reads the shot, `no design`
where no design names the screen, or `blocked · design not committed` where the ticket names an
export nobody has committed. A smoke-screen row reads `—`: a diff reaching no screen claims
nothing about the design.

**The gaps table.** Only where design review left a feature gap unfixed: one row a gap,
`Screen` · `Differs` · `Aligned by`. `Aligned by` is one of two things:

| Aligned by                     | The gap                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `#512`                         | **deferred** — its fix is another ticket's, and that issue carries both shots |
| `accepted · DEVIATIONS.md D3`  | **accepted** — the app is right, for the reason that row gives                |

A **deviation** is any feature gap between a screen's Design and After. A deviation with a row
in `DEVIATIONS.md`, in the project's `kitchen.design` folder, is **accepted**: not a finding, and no ticket. A
PR that adds that row names it here, so the reviewer sees what they approve by merging. Gaps
fixed in the PR and fidelity gaps — spacing, size, shade — are not rows. No gaps, no table.

`/evidence` writes this table into the body itself, with the agent's own write: its images are
the project's own `github.com/<kitchen.repo>/` URLs, which that write keeps. A body written
before evidence has run carries no such table, and gains one then.

The purely textual diff — the prose exemption below — carries the one line naming what was
checked, where the table would be.

**The checks table.** Six rows, always the same six, in that order. Each is one agent phase,
and its `Found` cell is that phase's receipt
([`receipt.mjs`](../scripts/receipt.mjs) writes it):

| The phase returned | `Found` reads              |
| ------------------ | -------------------------- |
| a clean pass       | `0 found`                  |
| findings           | `3 found, 2 fixed, 1 open` |
| nothing to do      | `n/a · <the reason>`       |
| `blocked`          | `blocked · <the reason>`   |
| a risk tier        | `low · merges on green`, `medium · a person merges` |

Risk review's receipt is the one with no count: it judges the diff and raises nothing to fix,
so its cell is the tier and who merges —
[`risk.mjs`](../scripts/risk.mjs) writes that one.

`n/a` is the one value no receipt carries: it means the phase never ran, so there was nothing
to hand back. The orchestrator writes that cell itself.

`Where` is the link to what the phase posted. A skipped row's `Where` is `—`; every other row
has one, because a count nobody can open is a claim.

**A row is never dropped.** A phase that did not run says so with `n/a` and its reason — a
missing row and a clean pass read identically, and only one of them means the check ran.

**The left table.** Only where something is owed before the merge: `Left before merge` ·
`Who`, a row a thing. A finding still open, CI not green on the head, a `Depends on` PR not
yet merged, and the merge itself where a person makes it. `Who` is `agent` or `a person`.
Nothing owed — a low PR on green — carries no table, and `Next · auto-merge` stands alone.

`Next` is the second-to-last line and takes one value: `/code-review` · `/design-review` ·
`/content-review` · `/evidence` · `/risk-review` · `/unblock` · `auto-merge` · `merge` ·
`blocked #<n>`. `auto-merge` is a low PR the loop merges on green; `merge` is a person's.

`Closes #<issue>` is the last line, and is what closes the issue on merge.

A PR that can't be tested or merged on its own — it needs another open PR's changes merged
in first — names them above `Next`: `Depends on: #<n>[, #<n>...]`. That is what orders an EAS
build batch and earns the `depends-on-pr` label; `blocked #<n>` on `Next` still names the one
thing holding this PR back from review.

### The needs-a-human block

A PR with any `blocked` row, or any ask only a person can answer, opens its body with this,
above the Aim. A PR with none carries nothing above it.

````markdown
**Needs a human** · @jacksontriffon

| Row                       | Needs                          |
| ------------------------- | ------------------------------ |
| evidence · Profile screen | no design committed · #1031    |
| urgent · refund wording   | choose between the two drafts  |

**Unblock · evidence · Profile screen**

| Step | Do                                                |
| ---- | ------------------------------------------------- |
| 1    | Export the Profile screen from Claude Design     |
| 2    | Commit it to the `kitchen.design` folder         |
| 3    | Re-run `/evidence`                               |

The row fills with a Design shot instead of `blocked`.
````

- **A row a blocked cell.** Every `blocked` in the checks table, the change table or the
  evidence table gets one row here, named `<phase> · <what>`, with the reason in the world —
  the same words as the cell. The cell stays where it is; this is the copy a reviewer meets
  first.
- **A row an urgent ask.** A `kitchen.labels.urgent` or `kitchen.labels.needsHuman` item the
  run cannot settle — a decision, a secret, a device, a signed-in session — gets a row named
  `urgent · <what>`, and `Needs` is the one thing the person does. Waiting on the ordinary
  merge is not urgent: that is `Next · merge`.
- **The tag is on the first line.** The area's owner from `kitchen.humans`: for a blocked row,
  what `blocked.mjs owner <key>` prints; for an urgent one, the area it falls under, else
  `kitchen.humans.default`.
- **Steps are the way out.** One `Unblock` table a row, per the [Comments](#comments) rules:
  only where the reader holds what the run does not — a secret, an export, a device, a
  signed-in session. A run that can unblock itself does, and writes none. A blocked row's
  `Needs` ends in the `🧱 <key>` issue that holds the blocker, and a row with no steps yet adds
  that issue's `Next` bullet.
- **Gone when settled.** The hand-over write drops the whole block. A body that says
  `Needs a human` over a green PR is wrong.

Every write that sets `Next · /unblock`, or fills a checks row `blocked · <reason>`, writes
the block in the same call, so the body never says blocked without saying how to undo it.

### Who writes the body, and how

One way: `update_pull_request`, by the agent
([ADR 0005](adr/0005-an-agents-own-write-keeps-the-projects-image-urls.md), which supersedes
[0002](adr/0002-the-pr-body-is-written-twice-by-two-paths.md)).

An agent's own write strips `![](url)` to a link and escapes a raw `<img>` for any host but the
project's. A shot hosted on `evidence/<pr>` by
[`push-shots.sh`](../scripts/push-shots.sh) is the project's, so the table carrying it
survives. Read the body back after writing it: every `<img>` is there, or a cell held a URL from
somewhere else, and the fix is to push the shot to `evidence/<pr>` and write the cell again. No
other host carries a shot, and a cell never holds a backticked `<img>`.

## Labels

Four labels say what a reviewer is signing up for before they open the diff.
[`pr-labels.mjs`](../scripts/pr-labels.mjs) decides them from the diff's paths and the
body, not a reading of either:

| Label           | The PR                                                        |
| --------------- | ------------------------------------------------------------- |
| `db-change`     | touches the database schema or its migrations                 |
| `skill-change`  | touches `.claude/`, `docs/agents/` or `CLAUDE.md`             |
| `depends-on-pr` | carries a `Depends on: #<n>` line                             |
| `evidence`      | carries a shot from `evidence/<pr>`                           |

Every write that opens a PR, pushes to it, or rewrites its body relabels it, because a fixup
push or the hand-over body can change the answer:

```bash
git diff --name-only origin/<kitchen.baseBranch>...HEAD \
  | node .claude/kitchen/scripts/pr-labels.mjs .claude/tmp/body.md <every label the PR carries now>
```

`.claude/tmp/body.md` is the body as last written — the one just sent, or, on a push that left
the body alone, the one `pull_request_read` hands back.

It prints the whole set to write — `issue_write` (`update`, `labels`) replaces a PR's labels
rather than adding to them. Labels it does not own (`ready-for-*`, `native-change`, `claimed`) pass through
untouched, and one of its own the change no longer earns drops out. A lane PR is relabelled too:
its diff is every batch PR's, so it inherits their `db-change` and `skill-change`.

### The claim label

`claimed` (`kitchen.labels.claimed`) is on a PR or issue while a session works it.
[`next-work.mjs`](../scripts/next-work.mjs) reads it, with the item's `updated_at`, to leave
claimed work alone, so choosing work reads no comments. The claim comment beside it settles a
race between two sessions and says how the run ended; each edit to it moves `updated_at`, which
keeps the label live. A release takes the label off. A session that loses a race leaves it on.

### Risk labels

Two more say who merges it, and come from [`/risk-review`](../../skills/risk-review/SKILL.md)
rather than the paths alone — the paths set a floor, the diff and the ticket can only raise it:

| Label                     | The PR                                                                 |
| ------------------------- | ---------------------------------------------------------------------- |
| `risk:low` · `auto-merge` | the loop merges it on green, on the head its verdict names — no person needed |
| `risk:medium`             | a person merges it — ordinary product behaviour, a sensitive area      |
| `risk:high`               | a person reads the diff — money, auth, the schema, CI, the gate        |

`risk.mjs labels` writes them, the same whole-set way. A label is the verdict a reader sees; it
is not what the merge trusts. Before it merges, `/drive-pr-green` step 11 runs the base branch's copy of
`risk.mjs gate`, which reads the `🎚️ **Risk**` comment that names the head SHA and recomputes the
floor, and merges with that SHA pinned, so a push after the verdict refuses the merge
([ADR 0006](adr/0006-the-loop-merges-a-low-pr-on-the-commit-its-verdict-names.md)).

## Cells

**Eight words a cell.** A row needing more is two rows, or is not one.

Three things are exempt, because each carries something a reader copies rather than reads:

| Exempt                            | Carries                                         |
| --------------------------------- | ----------------------------------------------- |
| a `Steps` cell                    | the command that reproduces the shot            |
| a `Do` cell, in an `Unblock` table | the action the reader takes                    |
| the closing `Scan` line           | the route and the taps that show the ask landed |

Exempt from the word count, not from the trim. Two commands in a `Steps` cell is two rows.

**Angle brackets vanish** — GitHub eats `<owner/repo>`. Write it in backticks.

**A change you can photograph is.** The shot goes in the cell as
`<img src="<url>" width="320">`, hosted by
[`push-shots.sh`](../scripts/push-shots.sh) on `evidence/<pr>` and written by the
agent's own `update_pull_request`. A claim about the UI with no shot behind it is not a
row, it's a guess.

## Comments

Every comment is a set of **asks** — a row per thing that must change, naming the fix and what
breaks without it. [`/post-comment`](../../skills/post-comment/SKILL.md) shapes one
before it posts, and binds every skill that writes to a PR or an issue.

| The comment carries     | Columns                                             |
| ----------------------- | --------------------------------------------------- |
| asks nobody has met yet | code review `Fix` · `Because` · `Axis`              |
|                         | design review `Screen` · `Design` · `Build` · `Fix` |
|                         | content review `Line` · `Fix`                       |
| fixes already made      | evidence `What` · `Before` · `After` · `Steps`      |
|                         | hand-over `What` · `Before` · `After`               |

A comment carrying both is two tables in that order — what was fixed, then what is still owed.

Design review and content review carry no `Because` column because they show it instead: the two
shots differ, or the quoted line does. Where a reader cannot see the cost, write it.

An ask that could not be met reads `blocked` and its reason. Where the reader holds what the run
does not — a secret, an export, a device, a signed-in session — the steps out follow as **their
own table**, titled with the row they answer:

```markdown
**Unblock · Profile screen**

| Step | Do                                                             |
| ---- | -------------------------------------------------------------- |
| 1    | Export the Profile screen from Claude Design                   |
| 2    | Commit it to the `kitchen.design` folder                       |
| 3    | Re-run `/evidence`                                             |

The row fills with a Design shot instead of `blocked`.
```

A run that can unblock itself does, and writes no table.

**The one exception is the `🧱 **Blocked**` comment.** A run that tried and still stands
stopped posts dot points, not a table, because the next loop parses them — on one
`🧱 <key>` issue a root cause, and in a comment on each PR naming that issue.
[`blocked.mjs`](../scripts/blocked.mjs) writes and reads both, and
[`BLOCKERS.core.md`](BLOCKERS.core.md#a-blocker-with-no-row) has the shape. Numbered prose is not the alternative
— the table is the only shape, so a reader scanning a comment never has to switch modes.

Every comment closes on the **scan**: the PR's preview link or QR, and the last line
names the route and the tap that show the ask landed.

## Evidence

Every phase posts, findings or none — a clean pass with no comment is a check nobody can tell
ran; where the table would be empty, one line saying so is the row.

**One pair a PR, and [`/evidence`](../../skills/evidence/SKILL.md) is the only phase
that shoots it.** The same screen on the base and on the branch, beside its Design and the steps
that took both. It lands twice: as that phase's comment, and in the body's evidence table at
hand-over, which is the copy a reviewer actually sees. Other phases post findings, not pairs — a
build that photographed its own work and an evidence phase that photographed it again gave a
reader two shots of one screen and no more confidence than one. Design review judges evidence's
shots and takes none
([ADR 0003](adr/0003-design-review-reads-evidences-shots.md)).

| Diff reaches                                     | Post                                                            |
| ------------------------------------------------ | --------------------------------------------------------------- |
| a screen, directly or through the data it reads  | the pair, its Design shot, and the command that took it         |
| a feature an EAS build gates                     | the pair for what web shows; `blocked` naming the gated feature |
| a screen web cannot bring up                     | `blocked`, naming what stopped it                               |
| no screen — `tooling/`, `.github/`, `.claude/`   | the smoke pair: the route nearest the change, else `/home`      |
| prose alone — `.md`, `docs/`, an image, a font   | one line naming what you checked. No shot, no `blocked`         |
| a diff or prose only (code review, content review) | the quote — there's no screen to open                         |

That last-but-one row is the **prose exemption**, and it is the only one: a diff whose every
path is prose, an image or a font posts a line instead of a pair.
[`is-skippable-change.mjs`](../scripts/is-skippable-change.mjs) decides it, not a
reading of the file list.

**A lane PR is exempt from all of this.** `/test-pr` opens one per lane to carry a build; it
runs no phases, shoots nothing, and its body is the device-test steps and the merge order. A
checks table on one would be six `n/a` rows.

`blocked` here is never a `done` with a caveat buried in prose, never a shot posted anyway
because one exists, and never what a first failing command earns:
[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](BLOCKERS.core.md) hold the
blockers already met and their fixes, and a
run stops only on one it has no row for — posting the reason, where the pair would have gone.

A native feature never excuses the rest of the screen: shoot everything web can reach first,
then name the gated feature `blocked` on its own — see
[`/verify-expo`'s native-change path](../../skills/verify-expo/SURFACES.md#a-native-change-and-the-build-that-carries-it)
for what carries that feature's evidence instead (the build's log and download link).

Run [`/content-review`](../../skills/content-review/SKILL.md) over anything before
posting, then [`/post-comment`](../../skills/post-comment/SKILL.md) over the comment
itself.
