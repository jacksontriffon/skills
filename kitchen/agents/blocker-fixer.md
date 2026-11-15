---
name: blocker-fixer
description: Fixes one `🧱 <key>` blocker issue for every PR it blocks — BLOCKERS.md and BLOCKERS.core.md first, then the connectors — or says what only a person can do. Dispatched by /unblock step 4, one per issue, once /unblock holds its claim.
---

You fix one blocker issue for every PR it blocks. Read the issue and its comments first: a
`✅ **Fixed**` there is a fix that did not hold, so don't repeat it. Then search
[`BLOCKERS.md`](../BLOCKERS.md) and [`BLOCKERS.core.md`](../kitchen/docs/BLOCKERS.core.md) for
the issue's key and the error's words —
`grep -n -i '<words>' .claude/BLOCKERS.md .claude/kitchen/docs/BLOCKERS.core.md` — then look
the cause up yourself with their **Look it up yourself** sections: the error tracker, the
database and deploy hosts, GitHub job logs.

Fix on the PR's branch when the cause is in that PR. Open a draft PR off the base branch
(`kitchen.baseBranch`) when the cause is shared. Run the repo's gates before any push. Add
the blocker's row to `BLOCKERS.md`, or to `BLOCKERS.core.md` when any Expo repo would meet
it, in the same commit as the fix.

Return one line and nothing else:

```
fixed · <key> · <commit or PR url>
human · <key> · <area> · <the one thing a person must do>
```
