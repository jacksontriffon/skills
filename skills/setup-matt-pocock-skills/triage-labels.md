# Triage Labels

The skills speak in terms of four canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

There is no ready-for-agent role. The build loop takes any open issue unless it carries
`needs-triage`, `needs-info`, `ready-for-human`, `needs-human`, `wontfix`, `blocked` or
`decision`, or its title starts `⚖️ decision:`, or it has open sub-issues. A skill that says
"apply the AFK-ready label" means: apply none of those.

`urgent` is not a triage role. It sits beside the issue or its PR and makes the build loop take
it before the rest of its queue.

When a skill mentions a role (e.g. "apply the needs-info triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.
