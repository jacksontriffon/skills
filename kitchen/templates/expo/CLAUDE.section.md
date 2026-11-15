<!-- kitchen:start -->
## Kitchen

This repo runs the kitchen loops: `/find-work` → `/unblock` · `/drive-pr-green` · `/pick-up-ticket`, and `/fix-top-error`.

- Standing facts (repo, labels, ports, adapters, humans) are printed at session start by `kitchen.mjs brief`, from `.claude/kitchen.json`. Read that; never guess a path.
- Stuck? `grep -n -i '<words from the error>' .claude/BLOCKERS.md .claude/kitchen/docs/BLOCKERS.core.md`. Never read either whole.
- Vendored, do not hand-edit: `.claude/kitchen/`, kitchen skills and agents, `.github/workflows/kitchen-*.yml`. `.claude/skills.lock` names every such file. Change them upstream, or through a `kitchen.json` key.
- Health: `{{PACKAGE_MANAGER}} kitchen:doctor`.
<!-- kitchen:end -->
