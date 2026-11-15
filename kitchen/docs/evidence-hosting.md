# Hosting evidence images

A shot reaches a reader as an `<img>` in a PR body or comment. With the `git-branch` evidence
host (`adapters.evidenceHost` in [`kitchen.json`](../../kitchen.json)) that takes one branch and
one write, both from the agent's own session:

| Hop  | What                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------ |
| host | [`push-shots.sh`](../scripts/push-shots.sh) commits the PNGs to `evidence/<pr>` and prints their URLs                    |
| post | `update_pull_request` or `add_issue_comment` carries `<img src="<url>" width="320">` in a table cell                     |

The URL is `https://github.com/<kitchen.repo>/blob/<commit-sha>/<pr>/<name>.png?raw=true`,
pinned to the commit that push made. A later lap's push makes a new commit with the branch's
tip as its parent, so each lap's URLs stay valid and a comment from lap one still shows lap
one. A branch cannot be bare `evidence`: `evidence/<n>` already exist, and git refuses a ref
that is both a file and a directory.

It renders for anyone signed in to a repo that can read the branch, which is where a PR is read.
In a private repo it does not render to an anonymous viewer, and nothing here tries to.

## Why the agent's own write is enough

The sanitizer on an agent's GitHub writes strips `![](url)` and escapes `<img>` for a host it
does not trust. It trusts the project's own `github.com/<kitchen.repo>/` URLs, in a body
and in a comment alike
([ADR 0005](adr/0005-an-agents-own-write-keeps-the-projects-image-urls.md)). After the write,
read the stored text back: every `<img>` is there, or a URL was not the project's.

## Where a shot is taken

A session shoots and pushes its own, and no runner sits in the path. A service a container cannot
reach is stood up inside it instead, or the flow that needs it is `blocked` with the host named.
[`push-shots.sh`](../scripts/push-shots.sh) pushes to the `evidence/<pr>` branch of
`kitchen.repo` and nowhere else: an origin that is not that repo, an old name GitHub still
answers to, stops it before it writes. So every shot reaches the body by one write, and no
second host exists: proof is hosted on the project's repo, or it is code.

## When there is nothing to photograph

Proof is then a fenced code block: the command and its output, in the cell or under the
table. A shot that could not be taken is a `blocked` row that says so. It is never a link to
another host, and never a shot of somebody else's page.

## Tried and closed

| Path                                                  | Why it is closed                                                                                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `raw.githubusercontent.com` links to a committed file | In a private repo the anonymous fetch GitHub makes for a comment image 404s. The `github.com/…/blob/<sha>/…?raw=true` form is fetched as the signed-in viewer and renders.        |
| Shots committed to the PR's own branch                | They ride into the base branch on merge and bloat every clone. The `evidence/<pr>` branch is never merged.                                                                         |

A project's own dead ends are in its `docs/agents/evidence-hosting.md`, where it keeps one.
