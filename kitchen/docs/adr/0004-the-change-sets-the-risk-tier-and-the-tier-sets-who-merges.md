# The change sets the risk tier, and the tier sets who merges

**Superseded by [ADR 0006](0006-the-loop-merges-a-low-pr-on-the-commit-its-verdict-names.md)** on
how a low PR merges: the loop merges it, and the gate workflow is gone. The tiers stand.

Every PR the loop finished waited for one person, `ready-for-human`, whether it moved a credit
balance or a full stop in a README. Anthropic's answer to the same queue
([Solving code review at Anthropic](https://claude.dev/blog/solving-code-review-at-anthropic/)) is
that the change, not the author, sets a risk tier, and the tier sets how many people must
approve: none for low once automated review and security checks are green, one for medium, two
for high. Some paths always need a person, and any CI workflow file is one of them.

**So `/risk-review` runs last in `/drive-pr-green`, on the head commit, and picks `low`, `medium`
or `high` by two questions: which tier the diff earns, and whether it needs a person anyway.
`risk.mjs` sets a floor from the paths that neither answer can lower. A low PR gets GitHub's
auto-merge; a gate workflow turns it off on any head a low verdict does not name.**

## Considered options

- **Count approvals per tier, as Anthropic does.** Every agent writes to GitHub as the one human
  in [`kitchen.json`](../../../kitchen.json)'s `humans`. GitHub refuses an approval from a PR's
  author, and an agent's comment is indistinguishable from the human's. A required approval count
  could never be met, and nothing it counted would mean a person looked. Until agents write as
  their own identity, the person's sign-off is the merge button itself, and the gate decides only
  whether that button is needed.
- **Let the agent's verdict alone enable auto-merge.** The verdict is judgement, and the same
  session that wrote the change writes it. The floor is the part a misjudgement cannot move, so
  it runs from the base branch's copy of `risk.mjs` in a `pull_request_target` workflow that never
  checks out the PR: a PR cannot rewrite the rules that judge it, and a PR touching those rules is
  `high`.
- **Make the gate fail on medium and high.** Required as a status, a failure would block the
  person's own merge, and they would learn to bypass rules that also guard CI. It reports success
  on every tier and acts only on auto-merge.

## Consequences

The gate must be a required status check on the base branch, with CI's jobs, and the repository
must allow auto-merge. Being required is what makes GitHub wait for it on each new head; without
either setting `enable_pr_auto_merge` is refused, and `/drive-pr-green` hands the PR to a person
as if it were medium.

A verdict covers one commit. A fix lap, a merged base branch or a hand-resolved conflict is a new
head, and the gate turns auto-merge off on it until risk review runs again.

The gate also refuses a fork, a PR or ticket from outside `kitchen.json`'s `humans`, a `blocked`
label and a checks table that counts anything open — Anthropic's trusted-author list and "no open
findings" rule, read off what the loop already writes.

Anthropic blocks merge on any open security finding from a dedicated review. The loop has no such
phase yet; risk review's step 3 asks the security questions and raises the tier instead of filing
findings, which keeps a low PR from merging past one but fixes nothing.
