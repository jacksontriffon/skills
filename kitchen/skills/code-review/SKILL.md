---
name: code-review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes — Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/PRD asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / PRD / spec?

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

The issue tracker should have been provided to you — run `/setup-matt-pocock-skills` if `docs/agents/issue-tracker.md` is missing.

## 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here — not inside two parallel sub-agents.

Done when the fixed point resolves and the diff is non-empty.

## 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.) — fetch via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A PRD/spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

Done when the spec is in hand, or its absence is recorded for the report.

## 3. Identify the standards sources

`CLAUDE.md` always, plus anything else documenting how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

Always also pull in the `errors` adapter's standard for how failures get reported (`kitchen.adapters.errors`; the adapter lands in #984, and until it does that standard is [`docs/observability/error-tracking.md`](../../../docs/observability/error-tracking.md)). Every new or touched failure path in the diff (a thrown error, a `catch`, a swallowed rejection, a new endpoint or function branch that can fail) must reach the error tracker through one of the established capture points that standard lists, rather than stopping at `console.log`/`console.error`, a bare `throw`, or silence. This is a **hard violation**, not a judgement call: a new failure path with no capture-point wiring is unreported by construction, and the daily error sweep can only ever see what got captured.

Always also pull in the project's catalogue of journey events (until #984, [`docs/observability/analytics-events.md`](../../../docs/observability/analytics-events.md)). A new `capture` call, a new server event, or a property on either with no row in the catalogue is a **hard violation**: quote the hunk and name the missing row. A property added at a call site without a row does not exist.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below — a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation — and, like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Comments** — narration, a restated signature, a ticket reference, rationale: anything but a warning the code can't give itself. → delete it; rename or extract until the code says it.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

Done when the standards sources are listed and the baseline above is ready to paste.

## 4. Spawn both sub-agents in parallel

Send a single message with two `Agent` tool calls. Use the `general-purpose` subagent for both.

**Standards sub-agent prompt** — include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full — the sub-agent has no other access to it.
- **The observability check, pasted in full**: "Every new or touched failure path in the diff — a thrown error, a `catch`, a swallowed rejection, a new endpoint or function branch that can fail — must reach the error tracker through an established capture point named in the standard you were given. `console.log`/`console.error` alone, a bare rethrow with no capture call, or silent swallowing is a hard violation, not a judgement call — quote the hunk and name the missing capture point."
- The brief: "Report — per file/hunk where relevant — (a) every place the diff violates a documented standard: cite the standard (file + the rule); (b) every failure path missing error-tracker capture, per the observability check above; and (c) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls — documented-standard breaches and missing-capture findings are hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** — include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

Done when every dispatched sub-agent has returned its report.

## 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

Done when both axes have a section and neither's findings have been merged into the other's.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.

## 6. Post the verdict

The aggregation above is the terminal report. A review posted to GitHub is one table instead,
shaped by [`/post-comment`](../post-comment/SKILL.md): a row per ask under `Fix` · `Because` ·
`Axis`, then `Next`. Never the sub-agents' prose.

Every row reads `Fix <what>`, and `Because` names what breaks — a user who hits it, a reader
it misleads, a thing that falls over. That narrows both axes on the way out:

- **A judgement call resolves into an ask before it posts, or it stays in the terminal.** The
  smell baseline is a set of labelled heuristics, and `possible Feature Envy` asks the reader
  for nothing. Post the move it implies and what not making it costs.
- **Sound code goes unwritten.** What already conforms asks nothing of anyone.

Keep the axes separate — `Axis` reads `spec` · `std` where a `Fix` does not say which. An axis
whose findings all resolved to nothing still posts, one line saying it is clean: a review that
ran and found nothing is not the same as a review that never ran.

Done when the comment is posted and every surviving finding is one row in it.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into, each with the steps
out. Stopping is for a blocker with no row there.

## Output

A receipt — [`receipt.mjs`](../../kitchen/scripts/receipt.mjs)'s one line — carrying the number of
asks the comment raised and its URL. The findings themselves stay on GitHub
([ADR 0001](../../kitchen/docs/adr/0001-a-phase-posts-its-detail-and-returns-a-receipt.md)).
