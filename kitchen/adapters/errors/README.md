# Adapters for the errors slot

`.claude/kitchen/adapters/errors/<name>/<action>` is one executable per action, and
`adapters.errors.use` in [`kitchen.json`](../../../kitchen.json) names the `<name>`. Run one
through the dispatcher, which hands it the slot's settings and passes its exit code on:

```
node .claude/kitchen/scripts/adapter.mjs errors top [--window <days>d]
node .claude/kitchen/scripts/adapter.mjs errors search [--window <days>d]
```

| Action   | Answers                                         | Window if none given |
| -------- | ----------------------------------------------- | -------------------- |
| `top`    | the unresolved issues, most severe first        | 7 days               |
| `search` | one query over a window, for a report or a sweep | 30 days              |

Both print one JSON object and exit 0:

```json
{ "slot": "errors", "adapter": "…", "action": "top", "enabled": true,
  "window": { "days": 7, "from": "-7d" }, "pins": { "…": "…" }, "guide": "<path from the repo root>" }
```

An adapter that has nothing to answer prints `"enabled": false` and a one-line `"reason"`
instead of `window`, `pins` and `guide`. A skill reads `reason` out as it is.

A tracker is reached through MCP, which a script cannot call, so `pins` carries the ids a call
needs and `guide` names the document that holds the calls. Exit 1 is a config the adapter
cannot use, 2 is a bad argument.

[`adapters.test.mjs`](../../scripts/adapters.test.mjs) runs every directory here against this
contract. A new adapter is a new directory, and nothing else changes.
