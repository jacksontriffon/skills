# Blockers

This file holds this repo's own rows. The rows every kitchen project shares are in [`kitchen/docs/BLOCKERS.core.md`](kitchen/docs/BLOCKERS.core.md).

Search both for the words in the error, and never read either whole:

```bash
grep -n -i '<words from the error>' .claude/BLOCKERS.md .claude/kitchen/docs/BLOCKERS.core.md
```

Each row is one line: the symptom as it appears in the log, then the fix. Add one when a run needed a person to get past something.

| Symptom | Fix |
| --- | --- |

## Look it up yourself

Rows for things an agent can find out on its own, before it asks a person. See the section of the same name in [`kitchen/docs/BLOCKERS.core.md`](kitchen/docs/BLOCKERS.core.md#look-it-up-yourself).
