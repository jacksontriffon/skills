# The PR body is written twice, by two paths

**Superseded by [ADR 0005](0005-an-agents-own-write-keeps-the-projects-image-urls.md)** for any
image on the project's own `github.com` URLs, which an agent's own write keeps. What follows holds
only for an image on an object-store bucket's URL.

An agent's own GitHub writes are sanitized: `![alt](url)` loses its `!` and a raw `<img>` comes
back HTML-escaped inside backticks. This was known of the comment tool, which is why a workflow
posts comments — a runner posts the body with `GITHUB_TOKEN` instead, and the images render. What
was not known is whether a **body** write is sanitized the same way.

It is. Probed on a PR: a body written by `issue_write` read back with the `!` stripped and the
`<img>` escaped, identically to a comment. The sanitizer is content-wide rather than
tool-specific, so `update_pull_request` is not a third case.

**So the body is written by two paths. In flight, the orchestrator writes it directly — cheap, and
it carries no shots. At hand-over, when the body carries the evidence pair, it goes through the
comment workflow with `target: body`.**

## Consequences

The comment workflow gains a `target` input taking `comment` or `body`. Everything either target
does is already there — the shot-reachability check, the `comment-body.mjs` render — so the change
is which REST call the last step makes.

A direct body write that carries a shot URL arrives with the image dead. Nothing mechanical stops
one, so the rule is stated where the body is written rather than enforced: shots mean the
workflow.

The in-flight path stays direct on purpose. A body `PATCH`ed between phases carries a phase name
and a checks table and nothing photographable, and routing it through a runner would cost a
workflow dispatch per phase to render markup that is not there.
