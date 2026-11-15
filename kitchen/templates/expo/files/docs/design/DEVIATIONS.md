# Deviations

One row a deliberate difference between the design and the app: what the design shows, what the app does instead, and why. A **deviation** is any feature gap `/design-review` finds between a screen's Design and After shots. One with a row here is an **accepted deviation**: not a finding, no ticket, no block.

`/design-review` reads this before it raises a finding. A gap matching a row — same screen, same element — goes in the PR body's gaps table as `accepted · DEVIATIONS.md D3` and nowhere else.

## Adding a row

In the PR whose design review found the gap, never on its own, so the reviewer approves the row by merging the change that needs it. The PR body names it.

`Why` is a fact from outside the design: a platform constraint, what Expo web can render, an accessibility rule, or a decision an [ADR](../adr/) or [`CONTEXT.md`](../../CONTEXT.md) records — linked. "Simpler to build" is not one; that gap is fixed or deferred to an issue.

Fidelity gaps — spacing, size, shade — never earn a row. They do not block, so there is nothing to accept.

## Removing a row

`/design-setup` re-reads every row for a screen a new export changes, and deletes the ones the new design has made untrue — the design caught up, or redrew the element.

## Rows

A section a design file, headed with its file name. `ID` runs on across the whole file and is never reused, so a PR that cites `D3` still means the same row after others are deleted.

```markdown
## <Design>.dc.html

| ID | Screen | Design shows | App does | Why |
| --- | --- | --- | --- | --- |
| D1 | <screen> | <what the design shows> | <what the app does instead> | <the outside fact, linked> |
```
