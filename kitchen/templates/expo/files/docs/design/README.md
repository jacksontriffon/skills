# Design export

`/design-review` compares the built screen against the design it was built from. The design side is a Claude Design export, committed here and served by `.claude/kitchen/scripts/design-server.sh`.

| File | What it holds |
| --- | --- |

`/design-setup` fills this table. One export is the one design, and the source of truth. A new export replaces it, and the old one is deleted in the same commit. `STATES.md` names each state and the acts that reach it.

Deliberate differences between the design and the app are rows in [`DEVIATIONS.md`](DEVIATIONS.md).

## Reaching a screen

A screen is a `>`-separated tap path of visible text, one click each. The `shoot-design` workflow takes it as a chip, and `capture.mjs` clicks it in order. Shoot at `phone`.

| Screen | Chip | What the taps do |
| --- | --- | --- |

`/design-setup` fills this table too.
