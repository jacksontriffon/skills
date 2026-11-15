---
name: search-errors
description: Search the error tracker for errors the right way — right project, a window wide enough, the server and the client both, real devices told apart from automation. Use whenever anyone looks for an error, a crash, or a "this failed for a user" report, and before claiming an error was or was not reported.
---

# Search errors

Every error search in this repo goes through here — a report from a user, a failing screen,
"is anything breaking", the daily sweep. It leaves one finding: what was found, in which
project and window, and what the search **could not** have seen.

The tracker is reached only through the `errors` adapter, which `kitchen.adapters.errors.use`
names. What a property on an event means, what is never reported, and where the other logs live
is the project's own: the **error doc**, the file `kitchen.adapters.errors.doc` names. A project
without one has nothing to add to what the adapter's `guide` says.

A connection does not always start in the project the app reports to. It can land on a decoy
that holds a stray event and none of the app's data. A search run there comes back empty, and
empty reads as "nothing happened". That is the failure this skill exists to stop.

## 1. Pin the project

```bash
node .claude/kitchen/scripts/adapter.mjs errors search
```

The adapter's JSON says `enabled`. When it is `false`, output `not found in anything: <reason>`
and stop: no tracker is configured, so no search ran and none can say an error did not happen.

Otherwise it carries `pins` and `window`, and `guide` names the document that holds the calls.
Follow the guide's **Pin the project** with those pins. A switch is session state, so repeat the
check after any context reset and before the first query of a new search.

Done when the guide's pin check has passed in this session, or the run has stopped at `enabled`
being `false`.

## 2. Prove the pipe carries data

Follow the guide's **Prove the pipe**. Expect rows from the app's own SDK. None → nothing is
arriving, and no search below means anything; say so and name the smoke test's command from
the error doc as what
settles it.

Done when you can name the SDKs and platforms sending events in the last 7 days.

## 3. Search the exceptions

Follow the guide's **search**, over the window from step 1. Start from the exception events,
not the issue list: the list lags raw ingestion and has come back empty against a project that
held issues.

Read **Reading the events** in the error doc
before the rows: what each property is called, which of them are not on an exception, and what
a value that matches nothing looks like.

Done when the rows are in hand with their platform, operation, message, people and last seen,
over the window from step 1.

## 4. Search both sides of the call

A failure the user felt on the phone can be recorded on the **server** alone — the client may
have given up before it reported, or reported nothing. Read the server's rows for the same
operation as well as the client's, and widen to 30 days: a first pass over 14 days has missed
seven server errors three weeks earlier.

Same-shaped messages across operations — `x.getTime is not a function`,
`e.toISOString is not a function` — are one fault: a `Date` that arrived as a string. Search
that message across every operation before deciding a failure is isolated.

Done when the server rows for the same operation have been read, or none exist in 30 days.

## 5. Tell a device from automation

Agent runs and local dev send real-looking events. Apply the project's rules in
**Reading the events** in the error doc
before counting a person. When a user says it failed on their phone, find **that** device's
person from its other events, then list every event it sent — the guide's **search** has the
query.

Done when every exception you will cite is labelled device or automation.

## 6. Check what is never reported

An empty result may be by design. The project lists what is not captured under
**What is deliberately not reported** in the error doc,
and where each capture point sits under **What is captured**. Find the capture point for the
failure you are chasing.

No capture point on that path → say no report could exist, so none being there proves nothing.

Done when you can say, for the failure in question, whether the app would have reported it.

## 7. Cross-check the other logs

When the tracker is silent and the code says it would have spoken, read the services on the
failing path, the way **Other logs** in the error doc
says for each.

Done when each service on the failing path has been read, or the failure never reached one.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into, each with the steps
out. Stopping is for a blocker with no row there.

## Output

One finding, in this order: the project and window searched (`pins.projectName`, the window in
days), what was found with its platform, operation, people and last seen, whether each row is a
device or automation, and one line on what the search could not have seen. "Not found" is
stated as **not found in** that scope, never as "did not happen".
