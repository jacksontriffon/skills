# An agent's own write keeps the project's image URLs

[ADR 0002](0002-the-pr-body-is-written-twice-by-two-paths.md) found that an agent's own GitHub
write strips `![alt](url)` and escapes a raw `<img>`, a PR body as much as a comment, and
concluded that every body carrying a shot goes through a runner. It probed one URL: an
object-store bucket's. It did not probe a URL on `github.com` itself, and the conclusion that the
sanitizer is "content-wide rather than tool-specific" was true of that host and unexamined for any
other.

## What was probed

Two probes, one image in each form: a body and a comment written on a PR, then a comment written
through `add_issue_comment` and read back with `issue_read`:

| URL                                                       | `![](url)`                   | `<img src="url">`     |
| --------------------------------------------------------- | ---------------------------- | --------------------- |
| an object-store bucket                                    | `!` stripped, a link remains | escaped, in backticks |
| `https://github.com/<owner>/<repo>/blob/<sha>/…?raw=true` | stored as written            | stored as written     |

The sanitizer keeps the project's own URLs and strips the bucket's. Only those two hosts were
tried, so nothing here says what it does to a third.

A shot hosted on the project's own `evidence/<pr>` branch therefore needs no runner to post. The
URL is pinned to a commit sha, and renders for any signed-in viewer of a private repo — the only
readers a PR has.

## Decision

**A session shoots, hosts and posts its own evidence.** Shots are pushed to `evidence/<pr>`
with git plumbing ([`push-shots.sh`](../../scripts/push-shots.sh)), and the table goes into the PR
body, or a comment, by the agent's own write. The comment workflow and the bucket leave the main
path, and ADR 0002's rule — shots mean the workflow — no longer holds for a URL on the project's
repo.

## Consequences

The body is written one way, directly, at every phase. The two-paths split in 0002 ends for
anything but a bucket URL.

Nothing mechanical stops a foreign URL going into a cell, so the skill reads the stored body
back and counts the `<img>` tags: a stripped `!` or an escaped tag is the signal.

One case keeps the runner: a flow that reads a service a container cannot reach. Its shots land
in the bucket, and a body carrying one still goes through the workflow. Making that service
reachable from the session removes that case, and is a separate change.

The workflows and the upload script stay until then.

**Update.** A session can now stand up the service the container could not reach, so that case
no longer keeps the runner either. Every shot is taken in the session and pushed to
`evidence/<pr>` by `push-shots.sh`, which refuses an `origin` that is not `kitchen.repo`. The
workflows stay for a person to run by hand, and no skill dispatches one.
