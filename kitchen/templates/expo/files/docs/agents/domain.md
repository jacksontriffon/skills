# Domain docs

This repo is single-context: one `CONTEXT.md` glossary at the root, and decisions in `docs/adr/NNNN-<the-decision-as-a-sentence>.md`.

- Read `CONTEXT.md`, and the ADRs whose title touches your area, before exploring the code.
- If a term is missing from the glossary, proceed without asking. `/domain-modeling` adds it.
- The next ADR takes the next free four-digit number. If two branches take the same number, the branch that merges second renumbers.
- Use the glossary's terms, not synonyms.
- If your output contradicts an ADR, say so: "_Contradicts ADR-NNNN (…) — but worth reopening because…_".
