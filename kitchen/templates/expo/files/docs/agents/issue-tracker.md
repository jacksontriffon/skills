# Issue tracker: GitHub

Issues live on `{{REPO}}` (`repo` in `.claude/kitchen.json`). Pass that owner/repo to every call.

Cloud containers have no `gh`, so agents use the GitHub MCP tools. The `gh` column is for a person at a terminal.

| Operation | GitHub MCP | `gh` |
| --- | --- | --- |
| Create | `issue_write` (method `create`) | `gh issue create` |
| Read | `issue_read` (`get`, then `get_comments` / `get_labels`) | `gh issue view --comments` |
| List | `list_issues`, paged | `gh issue list` |
| Search | `search_issues` | `gh search issues` |
| Comment | `add_issue_comment` / `update_issue_comment` | `gh issue comment` |
| Labels | `issue_write` (method `update`). It **replaces** the whole set, so send every label to keep | `gh issue edit --add-label` |
| Close | Comment first, then `issue_write` (`update`, `state: closed`, with `state_reason`) | `gh issue close --reason` |
| Parent link | `issue_write` (`create` with `parent_issue_number`), or `sub_issue_write` (`add`, with the child's database id) | — |

## Titles and bodies

Titles follow the commit format, without the issue number. A decision is titled `⚖️ decision: …`.

A ticket's body has these sections:

```markdown
## Parent
## What to build
## Acceptance criteria
- [ ] …
## Blocked by
```

The build loop skips an issue with an open blocker or open sub-issues.

## PRs as a request surface

No. Requests are issues. A bare `#n` may be a PR or an issue: try `pull_request_read` first, then `issue_read`.

## Claiming

An agent claims a ticket with a comment: `🤖 **Claimed** · #<n> · <UTC time>`. The lowest-id claim under 24 hours old wins. A loser edits its comment to `🤖 **Released**`. See `/pick-up-ticket` step 2.
