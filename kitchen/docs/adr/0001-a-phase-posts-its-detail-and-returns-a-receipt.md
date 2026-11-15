# A phase posts its detail and returns a receipt

`/pick-up-ticket` runs each phase as a foreground sub-agent and takes back one word — `done`,
`findings` or `blocked`. One word is too little: the orchestrator cannot say how many findings a
phase raised, or where they are, without re-reading GitHub. **A phase now posts its detail to
GitHub and returns a receipt: the verdict, a count, and the URL of what it posted.**

The alternative was returning the findings themselves, and that is the thing the sub-agent
boundary exists to prevent. Review prose is the largest artefact a phase produces; handing it back
puts four hundred words an axis into the driving context, and a driver that grows is one that
eventually drops itself mid-run — no skill can invoke `/compact`, and an auto-compact re-attaches
invoked skills newest-first.

## Consequences

A receipt is three fields and a link, so the orchestrator can write the PR body's checks table
from what the phases returned rather than from a second pass over GitHub. `3 found, 2 fixed, 1
open` plus the comment link is the row.

The comment stays the record. A receipt names what was posted, never what was found — a reader
who wants the finding follows the link, and there is exactly one copy of it.

[`receipt.mjs`](../../scripts/receipt.mjs) parses and formats the line, so the shape is enforced
by a test rather than by every skill restating it. A phase whose last line does not parse is a
phase that did not report, and the orchestrator treats it as `blocked`.
