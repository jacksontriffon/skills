# Design review reads evidence's shots

No PR body had ever carried a design. The body's evidence table had no column for one, design
review ran only when a ticket carried a `## Design` heading, and each run that did shoot the
design shot it in the container, where the egress policy refused the upload — every Design cell
on one PR read `uncaptured · egress`. A reviewer reading the PR never saw what the screen was
meant to look like.

**So `/evidence` is the one camera and `/design-review` is a judge with no camera of its own.
Evidence shoots Design, Before and After in one lap on a runner; design review runs after it,
reads those shots, and checks each gap against the project's `DEVIATIONS.md` before calling it a
finding.**

## Considered options

- **Design review keeps its own app shots.** Two phases would shoot the same After by different
  steps, and the body would pair the design with an After design review never judged. Its shots
  were also the ones the egress kept refusing.
- **Design review folds into evidence.** Evidence records and never sends code back; that is why
  it can run last. A phase that raises findings is a phase whose output changes the code, and
  putting one in evidence would put a picture-by-picture comparison on every PR, refactors
  included.

## Consequences

Evidence is no longer last and alone. A design finding after it buys one more lap — fix, re-shoot
the After (Before and Design are cached), re-check the screens that had findings — and then
`blocked`, never a third.

A gap is fixed in the PR, deferred to a named issue carrying both shots, or accepted by a row in
`DEVIATIONS.md`. An agent may add that row only in the PR that needs it, with a `Why` from outside
the design, so the reviewer approves it by merging. `/design-setup` prunes rows when a new export
changes their screen, so the file does not only grow.

Design review blocks on **feature** gaps — an element on one side only, a different order,
different copy. Spacing, size and shade are **fidelity** gaps: reported, fixed where cheap, never
counted in the receipt.
