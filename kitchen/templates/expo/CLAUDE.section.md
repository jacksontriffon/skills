<!-- kitchen:start -->
## The aim

Every run ends with a PR whose body shows a Before/After screenshot proving the change works. One Routine fires `/find-work`, which runs the first of these that has work:

| Skill | Takes |
| --- | --- |
| `/unblock` | A blocked PR or ticket |
| `/drive-pr-green` | An open PR not yet green and merged |
| `/pick-up-ticket` | The next open issue |

A blocker is fixed where it is met: `.claude/BLOCKERS.md` and `.claude/kitchen/docs/BLOCKERS.core.md` first, then the connectors. One that stands is filed on one `🧱 <key>` issue per root cause, labelled `needs-human` and tagging the `humans` in `.claude/kitchen.json`. Any UI change shows its design; a gap is fixed, deferred to a named issue, or accepted in `docs/design/DEVIATIONS.md`. `/risk-review` tiers every PR on its head: the loop merges a low PR once CI is green on that commit, and medium and high wait for a person.

## Agent environment

Cloud containers have no `gh` (use the GitHub MCP tools, reading a `gh` command as the operation), no display (give the path), and no disk that survives (proof is a shot on `evidence/<pr>` via `push-shots.sh`, or a fenced command and its output).

## Claude Code skills

Unattended skills take one shape: `.claude/kitchen/docs/SKILL-TEMPLATE.md`, held by skill-shape's `UNATTENDED`. The loops are in `.claude/kitchen/docs/loops.md`.

**Search the blockers files, never read them whole:** `grep -n -i '<words from the error>' .claude/BLOCKERS.md .claude/kitchen/docs/BLOCKERS.core.md`.

Only Expo web runs in an agent container: `/verify-expo`, `/evidence` and `/screenshot`. Health: `{{PACKAGE_MANAGER}} kitchen:doctor`.
<!-- kitchen:end -->
