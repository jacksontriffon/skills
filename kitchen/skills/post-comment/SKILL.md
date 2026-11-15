---
name: post-comment
description: Shape a PR or issue comment into asks — a row per fix naming what breaks without it, or the Before/After of a fix already made, closing on the scan that checks it. Use before commenting on a PR or issue, and whenever /code-review, /design-review, /content-review or /evidence has findings to hand over.
---

Write down what you want to have happen in the real world as a result of what you are saying.

That sentence is the whole check. A comment reaches someone who can change the code, and it
earns its place by changing what they do next. So every row is an **ask**:

**Fix `<what>` because `<what breaks>`**

The `because` is a consequence out in the world — what a user hits, what a reader sees, what
falls over. A standard's name is not one on its own: cite it, then say what it costs here.

## 1. Cut to the asks

Keep the lines that ask for a change. The rest is the diff talking, and the diff is already on
the page.

- **The fix is the finding.** Naming the flaw costs more words than repairing it, so write the
  repair: `Move formatReading onto Lexeme because every caller re-fetches the entry to format it`,
  never `possible Feature Envy`.
- **A judgement call resolves into an ask, or it goes.** Where you cannot name what breaks,
  there is nothing for the reader to do and the line is a guess with a table around it.
- **Sound code stays unwritten.** What already works asks nothing of anyone.

Done when every surviving line reads `Fix <what> because <why>`, and the rows number exactly
what has to change.

## 2. Pick the shape

| The comment carries     | Table                       |
| ----------------------- | --------------------------- |
| asks nobody has met yet | `Fix` · `Because`           |
| fixes already made      | `What` · `Before` · `After` |

A comment carrying both is two tables in that order — what was fixed, then what is still owed.

[`pr-format.md`](../../kitchen/docs/pr-format.md) rules the rows and names the columns each
review posts under, including where a shot or a quoted line stands in for `Because` by showing
it.

Done when every row sits under one of those column sets, and the comment is tables and
nothing else.

## 3. Answer for what is blocked

An ask you could not meet reads `blocked` in its `After`, with the reason in the world rather
than in the process: `design not committed`, not `the shoot step failed`.

**A run that can unblock itself does, and writes no steps.** Steps are for what only the reader
holds — a secret, an export, a device, a signed-in session.

Where they are owed they go under the table as **their own table**, titled with the row they
answer: one action a step, in the order the reader takes them, closing on what they see when
it is unblocked.

```markdown
**Unblock · Word modal**

| Step | Do                                                |
| ---- | ------------------------------------------------- |
| 1    | Export the screen from Claude Design              |
| 2    | Commit it to `kitchen.design`                     |
| 3    | Re-run `/evidence`                                |

The row fills with a Design shot instead of `blocked`.
```

On a PR, the same rows and steps also open the body, above everything — see
[the needs-a-human block](../../kitchen/docs/pr-format.md#the-needs-a-human-block).

A comment is tables all the way down, so a reader scanning one never switches between a table
and a numbered list. A `Do` cell is exempt from the eight-word count, per
[`pr-format.md`](../../kitchen/docs/pr-format.md).

Done when every `blocked` names its reason, and carries steps only where the reader is the one
who can act.

## 4. Close on the scan

`pr-preview.yml` publishes an update and comments a **QR code** on every push, so the reader
already has this branch in their hand. The last line spends that: what to scan, then the route
and the tap that shows the ask landed.

`Scan the preview QR · Library → any video → tap a word · the reading shows`

A native change has no update to scan — the workflow says so on the PR — so the line names the
build carrying it instead. A diff reaching no screen names the command that checks it.

Done when the last line names a route and a tap, or the command that stands in for them.

## 5. Post

A comment carrying shots hosts them through [`/screenshot`](../screenshot/SKILL.md) first, so the
URLs in it are this repo's own; any other host's images arrive dead. One with no shots posts
directly.

Post even where nothing survived step 1 — one line saying the review ran clean is the row. A
pass nobody can see reads exactly like a phase that never ran.

Done when the comment is posted and reads back with an image in every cell that named a shot.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into, each with the steps
out. Stopping is for a blocker with no row there.

## Output

The posted comment's URL, and the counts its caller puts in a receipt: how many asks it
carries, how many are already met, how many are still open.
