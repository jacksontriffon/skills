# Triage labels

What each triage state means, and the label that marks it. The label strings themselves are configured under `labels` in `.claude/kitchen.json`; this page says what they mean.

| State | Meaning | Who moves it on |
| --- | --- | --- |
| needs triage | New, not yet read | Whoever triages |
| needs info | Cannot be worked until the reporter answers | The reporter |
| ready for agent | Specified well enough for an agent to pick up unattended | `/find-work` |
| ready for human | Needs a person: a decision, an account, a credential | A human |
| blocked | Started, then stuck on something outside the ticket | `/unblock` |
| won't fix | Closed on purpose | — |

A ticket carries exactly one state at a time.
