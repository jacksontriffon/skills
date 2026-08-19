---
name: grill-batch
description: Resolve a queue of wayfinder decision tickets in one pass instead of one per session.
disable-model-invocation: true
---

# Grill Batch

`/grilling` asks one question at a time and waits — right when a decision is load-bearing and the answer isn't obvious. It is the wrong shape once a map has accumulated a queue of tickets that are each a paragraph of thought: the ritual costs more than the decisions do, and the human ends up feeling they will never start building.

This skill trades depth for throughput — propose every remaining decision at once, take the human's reactions in a single pass, write them all up — and so deliberately breaks wayfinder's _never resolve more than one ticket per session_.

What it can degrade into is a **rubber stamp**: confident decisions produced at speed with none of the work under them. Every rule below exists to hold that off.

## What may be batched

A ticket qualifies when **getting it wrong costs an amendment, not a rebuild**, and the facts that settle it are readable in the repo rather than purely matters of taste.

Everything else belongs in `/grilling` — a ticket where the human's instinct _is_ the answer, or where a wrong call propagates into schema and code. Name those aloud and hand them back.

## 1. Triage

Load the map and every open ticket under it. Sort each by what it blocks: **the current build slice, a later slice, or nothing.** Show the human that split before proposing anything.

Done when every open ticket sits in one of the three groups and the human has seen it. This step is often the whole value — a queue of eleven where four block the build reads differently than it felt, and that alone changes what the human wants to do next.

## 2. Ground every proposal

Read the code, the schema, the tracker before writing a single proposal.

Done when every claim cites a file and line, or is marked as a matter of taste. Facts routinely invert proposals: a column that turns out to be `text` rather than an enum makes a "migration" into a validator edit; a random primary key with no external key turns a schema question into an upstream pipeline constraint. Ungrounded, the batch is a **rubber stamp** — worse than no batch, because the decisions arrive confident and fast.

Lead the proposals with any fact that changed an answer, so the human sees the ground shift before they read.

## 3. Propose everything at once

One block per ticket:

- **A bold one-line decision** — stated as a decision, not as options.
- **Two to four lines of why**, naming the sharp trade-off and what loses. Where a closed ticket already forces the answer, say which and how.
- **Every sub-question being left open**, marked as left open.

Done when every triaged ticket has a block and every block names what loses. Keep these to judgements the human can react to; the reasoning belongs in the write-up.

## 4. Take the reply in one pass

Expect terse replies — `yes`, `#116 - yes but make it a select`, `leave that one`. Each is a real decision: take it as final and move to the next.

Four shapes, handled differently:

- **Yes** — decided. Write it up as proposed.
- **Flip** — the shape changed. Follow the consequences across the rest of the batch before writing, since a changed answer often resolves or creates a **knock-on** elsewhere.
- **Park** (`leave for now`) — the ticket stays **open**. Comment the facts and a draft shape, saying plainly that nothing there is decided, so the legwork survives while reading as what it is.
- **Slip** — a ticket number not in the batch, a reference that doesn't parse. Flag it in one line and ask which they meant.

Done when every reply is sorted into one of the four with none left ambiguous.

## 5. Write up, close, index

Per decided ticket: a full resolution comment, then close, then one gist line into the map's **Decisions so far**. The comment holds the reasoning, the map holds the gist and the link — never both. An amendment arriving after a write-up goes on as a further comment, so the record shows what changed and why.

Then update the map in one push: the Destination, the fog, and any standing constraint a decision created. Follow wayfinder's own conventions for the map.

Done when every decided ticket has all three — comment, closure, map line — and any ticket that resisted is reported still open rather than closed thin.

## 6. Report the knock-ons

Every **knock-on** a decision opened lands in the fog under **Not yet specified** or becomes a ticket.

Done when every knock-on has a home and all of them reach the human in the same breath as the closes. A batch that closes six tickets while burying four new questions has hidden work rather than cleared it.

## Holding the line

- **Name every sub-question you noticed and the human didn't**, leave it open, and say you left it open.
- **State a concern in one line and keep going** — the batch stays moving.
- **A decision that turns out wrong gets amended.** The write-up is a record, not a position.

## After the batch

When nothing left on the map blocks the build, say so and offer `/to-tickets`. Batching was always about reaching the build, not about finishing the map.
