# Adapters for the evidenceHost slot

`evidenceHost/<name>/<action>` is one executable per action, and `adapters.evidenceHost.use` in
[`kitchen.json`](../../../kitchen.json) names the `<name>`. It is where a PR's shots are hosted.

```
node .claude/kitchen/scripts/adapter.mjs evidenceHost push <pr> <dir>
```

| Action | Does                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- |
| `push` | takes a PR number and a folder of PNGs, and prints one `<name>.png<TAB><url>` line per PNG      |

A later push for the same PR keeps the earlier shots it does not replace, and a URL a push prints is
pinned to what that push wrote, so a later lap never changes what an earlier comment shows.
[`push-shots.sh`](../../scripts/push-shots.sh) is `push` by the name the workflows and docs use.

## git-branch

Commits the PNGs to the `evidence/<pr>` branch of the repo `kitchen.repo` names, and prints that
repo's URLs. It has no settings. It pushes only to an origin that is that repo: a repository renamed
on GitHub keeps answering to its old name, so an origin left on it would push and print URLs a
sanitizer treats as foreign.

[`adapters-evidence-host.test.mjs`](../../scripts/adapters-evidence-host.test.mjs) pushes to a bare
repository standing in for origin, and [`push-shots.test.mjs`](../../scripts/push-shots.test.mjs)
holds the host's behaviour. What it cannot show is GitHub rendering the URL.
