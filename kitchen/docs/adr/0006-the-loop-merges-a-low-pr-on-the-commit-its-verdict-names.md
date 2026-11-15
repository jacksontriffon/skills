# The loop merges a low PR on the commit its verdict names

[ADR 0004](0004-the-change-sets-the-risk-tier-and-the-tier-sets-who-merges.md) handed a low PR
to GitHub's auto-merge and kept a runner, the gate workflow, to turn it off on any head a low
verdict did not name. No low PR merged that way. GitHub refuses to enable auto-merge on a PR that
is already mergeable, and `/drive-pr-green` gets CI green before its reviews and evidence, so by
hand-over the PR is `clean` and the refusal sent it to a person.

**So `/drive-pr-green`'s last step merges a low PR itself, with `merge_pull_request` and
`expectedHeadSha` set to the SHA its `🎚️ **Risk**` verdict names, once GitHub calls it `clean`.
Before it merges it runs the base branch's copy of `risk.mjs gate`, extracted with `git archive`,
never the branch's. A low PR whose CI is still running keeps its `auto-merge` label, and the next
`/find-work` tick merges it. The gate workflow is removed.**

## Considered options

- **Keep auto-merge and fix the refusal.** Enabling it only while a check is still running
  would work, but auto-merge outlives a push, so the runner would have to stay to turn it off on
  every new head — a second actor watching the first, on every push and comment.
- **Keep the runner beside a direct merge.** With the SHA pinned there is no window where an
  enabled auto-merge waits for a commit nobody reviewed, so the runner would have nothing left
  to switch off.

## Consequences

The merge trusts two things the agent cannot move: GitHub's own refusal when the head is not the
pinned SHA or a required check is not green, and the base branch's copy of the rules, which a PR
editing `risk.mjs` or `kitchen.json` cannot rewrite for itself. The verdict is still the agent's
judgement, and `risk.mjs gate` re-checks only its mechanical half: the floor, a trusted author
and ticket, no `open` or `blocked` in the checks table, and a low verdict on the head.

A low PR now waits for the next `/find-work` tick after its CI goes green, rather than merging
the moment it does. The gate was never a required check, so no ruleset changes with it.
