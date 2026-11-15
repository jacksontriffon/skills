# Triage labels

Each role maps to a label string. The strings live under `labels` in `.claude/kitchen.json`; the defaults are shown here. Use the label string from these tables.

## State roles

| Role | Label |
| --- | --- |
| needs-triage | `needs-triage` |
| needs-info | `needs-info` |
| ready-for-human | `ready-for-human` |
| wontfix | `wontfix` |

## Category roles

| Role | Label |
| --- | --- |
| bug | `bug` |
| enhancement | `enhancement` |

## What keeps an issue out of the build loop

There is no ready-for-agent role. The loop takes any open issue that `/pick-up-ticket` step 1 does not drop.

## Labels that are not triage roles

| Label | Set by |
| --- | --- |
| `urgent` | A person |
| `blocked` | `/drive-pr-green` |
| `needs-human` | `/unblock`, `/pick-up-ticket` |

PR labels are in [`.claude/kitchen/docs/pr-format.md`](../../.claude/kitchen/docs/pr-format.md#labels).
