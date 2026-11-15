<!-- kitchen:start -->
## Kitchen

This repo runs the kitchen loops: `/find-work` → `/unblock` · `/drive-pr-green` · `/pick-up-ticket`, and `/fix-top-error`.

- Standing facts (repo, labels, ports, adapters, humans) are printed at session start by `node .claude/kitchen/scripts/kitchen.mjs brief`. They come from `.claude/kitchen.json`; read that, never guess a path.
- Stuck? Search `BLOCKERS.md` and `.claude/kitchen/docs/BLOCKERS.core.md` for the error's words. Never read either whole.
- Vendored, do not hand-edit: `.claude/kitchen/`, kitchen skills and agents, `.github/workflows/kitchen-*.yml`. `.claude/skills.lock` names every such file. Change them upstream, or through a `kitchen.json` key.
- Health: `{{PACKAGE_MANAGER}} kitchen:doctor`.
<!-- kitchen:end -->
