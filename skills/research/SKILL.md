---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.

## Before opening a PR

A PR needs a resolved, actionable outcome — a recommendation the codebase can act on.
Findings still at MODERATE/LOW confidence, or carrying more open questions than resolved
ones, are not a PR: post them as a comment on the issue that asked for the research, and
stop there. Open the PR only once a follow-up pass resolves them.
