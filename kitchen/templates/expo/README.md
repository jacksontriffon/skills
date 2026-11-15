# Expo starter files

`sync-skills.sh --init expo` copies these into a project once and never overwrites them. A sync never reads this folder.

| Template | Lands at | How |
| --- | --- | --- |
| `files/**` | the same path from the repo root | Written when absent, kept when present |
| `files/.claude/kitchen.json` | `.claude/kitchen.json` | A value that is exactly `{{KEY}}` takes the detected value's type; a key init could not detect is left out |
| `settings.json` | `.claude/settings.json` | Written when absent; otherwise only missing `permissions.allow` rules and hooks are added |
| `CLAUDE.section.md` | `CLAUDE.md` | Appended once; its first line is the marker that says it is there |
| `package-scripts.json` | root `package.json` `scripts` | A script is added when its name is free; a name already taken is kept and reported |

Placeholders init fills: `{{REPO}}`, `{{BASE_BRANCH}}`, `{{PACKAGE_MANAGER}}`, `{{WORKSPACE_TOOL}}`, `{{APP_DIR}}`, `{{ROUTES_DIR}}`, `{{APP_ID}}`, `{{SCHEME}}`, `{{NATIVE_DIRS}}`. In prose and YAML an undetected value is written as `TODO-<key>`, so it reads as something to fill in.

`files/.claude/kitchen-denylist.txt` is zero bytes on purpose. `grep -f` on a file holding one blank line matches every line; an empty file matches none.
