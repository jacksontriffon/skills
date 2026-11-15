---
name: screenshot
description: Get a screenshot onto a GitHub PR, issue or comment so it renders instead of arriving as a dead link. Use when a shot has to reach GitHub, or when another skill needs its shots posted.
---

# Screenshot

Takes PNGs you already shot and leaves them rendering in a PR body, an issue or a comment. It
shoots nothing: [`/evidence`](../evidence/SKILL.md) is the camera, and calls the same two
commands this does.

The shots live on an `evidence/<n>` branch of `kitchen.repo`, and the post carries its own
`github.com/<kitchen.repo>/` URLs. An agent's own GitHub write keeps those and strips
every other host, so no runner and no bucket sits between the shot and the page
([ADR 0005](../../kitchen/docs/adr/0005-an-agents-own-write-keeps-the-projects-image-urls.md)).

`<n>` is the PR or issue the shots belong to.

## 1. Look

Open every PNG. A blank screen posted unseen reads as a working one.

Done when every shot has been opened.

## 2. Host

```bash
.claude/kitchen/scripts/push-shots.sh <n> <dir of PNGs>
```

It prints `<file>  <url>` for each shot, pinned to the commit it just pushed.

Done when it printed a URL for every PNG in the folder.

## 3. Post

`update_pull_request` for a PR body, `add_issue_comment` for a comment. Each shot goes in its
table cell as `<img src="<the URL>" width="320">`, and the table follows
[`pr-format.md`](../../kitchen/docs/pr-format.md).

Done when the write returned.

## 4. Read it back

`pull_request_read` or `issue_read` the result. Every shot reads as an `<img src=` carrying the
URL from step 2. A stripped `!`, an `<img>` inside backticks or a bare link means the URL was
not this repo's own, and the cell is still dead.

Done when the stored text holds one `<img src=` for every URL step 2 printed.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md#getting-it-onto-the-pr) and
[`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md#getting-it-onto-the-pr) carry what these steps run into —
the push that is refused, the image that reads back as a link, the shot a session cannot
take — each with the steps out. Stopping is for a blocker with no row there.

## Output

Every shot's URL, and the body or comment it now renders in.
