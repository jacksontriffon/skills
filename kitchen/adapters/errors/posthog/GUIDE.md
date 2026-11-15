# The posthog errors adapter

`top` and `search` answer through the PostHog MCP, which a script cannot call. So each prints
the pins and the window as JSON, and **this guide is the part that calls PostHog**: a skill
runs the action, reads `pins` and `window` from what it printed, and follows the section named
for that action. Every `<pins.x>` and `<window.from>` below is a field of that JSON.

Calls are `posthog:exec call <tool> {…}`.

## Pin the project

Run this before the first query of every search, and again after any context reset. A switch
is session state, and the connection does not start where the project is: it can land on
`pins.decoyProject`, an organization's default project that holds a stray exception and none
of the app's data. A search there comes back empty, and empty reads as "nothing happened".

```
posthog:exec call project-get {}
```

It must say `name: <pins.projectName>`, `id: <pins.project>`, `timezone: <pins.timezone>`.
Anything else:

```
posthog:exec call switch-organization {"organizationId": "<pins.organization>"}
posthog:exec call projects-get {}
posthog:exec call switch-project {"projectId": <pins.project>}
```

Then `project-get` again. A taxonomy warning that a property "is not found in this project
taxonomy", for a property the project's own error doc says the app attaches, means the wrong
project is pinned.

Done when `project-get` has returned the pinned name, id and timezone in this session.

## Prove the pipe

```
posthog:exec call execute-sql {"query": "SELECT properties.$lib AS lib, properties.platform AS platform, count() AS n, max(timestamp) AS last_seen FROM events WHERE timestamp >= now() - INTERVAL 7 DAY GROUP BY lib, platform ORDER BY last_seen DESC", "context": "governed catalog consulted: no match. Confirming the app's events are arriving before reading anything into an empty search."}
```

Rows from the project's own SDK are the expected answer. None means nothing is arriving, and no
search means anything.

## search

Pin the project, prove the pipe, then start from the exception events, not the issue list: the
list lags raw ingestion and has come back empty against a project that held issues.

```
posthog:exec call execute-sql {"query": "SELECT toDate(timestamp) AS day, properties.$exception_level AS lvl, properties.$exception_values AS msgs, count() AS n, count(DISTINCT person_id) AS people, max(timestamp) AS last_seen FROM events WHERE event = '$exception' AND timestamp >= now() - INTERVAL <window.days> DAY GROUP BY day, lvl, msgs ORDER BY last_seen DESC LIMIT 100", "context": "governed catalog consulted: no match. Listing every exception in the window."}
```

Add the properties the project's error doc says the app attaches (its platform, operation,
screen) as columns and as `AND` filters, and narrow by `AND person_id = toUUID('<id>')`. Then
the typed view of the same issues:

```
posthog:exec call query-error-tracking-issues-list {"status":"active","orderBy":"users","dateRange":{"date_from":"<window.from>"},"limit":25}
posthog:exec call query-error-tracking-issue-events {"issueId":"<id>"}
```

Everything one device sent around a failure:

```
posthog:exec call execute-sql {"query": "SELECT timestamp, event, properties.$exception_values AS msgs FROM events WHERE person_id = toUUID('<id>') AND timestamp >= now() - INTERVAL 14 DAY ORDER BY timestamp DESC LIMIT 100", "context": "governed catalog consulted: no match. Everything one device sent around the reported failure."}
```

`pins.timezone` is the project's: timestamps come back in its offset, so a window reasoned
about in UTC drops today.

## top

Pin the project, then:

```
posthog:exec call query-error-tracking-issues-list {"status":"active","orderBy":"users","dateRange":{"date_from":"<window.from>"},"limit":25}
```

Each issue carries `status`, `severity`, its users and occurrences under `impact`,
`last_seen`, `$exception_level`, `$exception_fingerprint`, an `assignee` and an
`external_reference`. Order by users first, occurrences second.

An empty list is not a quiet week. Confirm it against the events, with no time filter, ordered
by `timestamp` so the dates are read and not filtered on:

```
posthog:exec call execute-sql {"query": "SELECT event, timestamp, properties.$exception_fingerprint AS fp FROM events WHERE event = '$exception' ORDER BY timestamp DESC LIMIT 20"}
```

Rows here and nothing in the list: work from these, and say the list was stale.

## Read one issue

```
posthog:exec call query-error-tracking-issue {"issueId":"<id>"}
posthog:exec call query-error-tracking-issue-events {"issueId":"<id>"}
```

A `$session_id` off an event goes to `query-session-recordings-list` when the stack alone does
not say what the user did.

## Link a ticket back

Before any work starts, so every other run sees the issue as taken:

```
posthog:exec call error-tracking-external-references-create {"issueId":"<id>", ...}
```

## Suppress an issue

An issue whose fault is upstream and unfixable is set to `suppressed` with the reason on its
ticket. Never `resolved`: that claims a fix.
