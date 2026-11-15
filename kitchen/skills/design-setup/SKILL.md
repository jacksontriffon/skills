---
name: design-setup
description: Collect a design, index its screens on the map, and write a Design contract into every ticket that builds one.
disable-model-invocation: true
---

Runs at the end of the Wayfinder loop, once `/to-tickets` has sliced a map and
before anyone builds.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

The **contract** is a `## Design` section on the ticket, saying which screen the
ticket builds and how to reach it on each side. `/evidence` shoots both sides from it and
`/design-review` judges them, each an agent that sees only the ticket handed to it, so the
contract stands alone — no map, no repo tour, no human.

## Verify, never invent

Every route and chip label written into a ticket comes from the lists built in
step 3. A wrong reach step is worse than an absent one: design review follows it,
lands on the wrong screen, and reports the mismatch as a defect in the build.

What you cannot verify, mark: routes this ticket creates get
`(new — this ticket creates it)`, unchecked steps get
` *(unverified — not built yet)*`.

## Process

### 1. Load the map and its build tickets

Argument is a map (URL or number), or one ticket to redo alone.

Build tickets are **not** the map's GitHub sub-issues — those are the wayfinder
decision tickets. Build tickets link the map in their `## Parent` section, so
list open issues and read bodies (GitHub MCP `list_issues` then `issue_read`, or
`gh issue list --json number,title,body`).

Done when you hold the map body and every build ticket's `## What to build`.

### 2. Ask the user for the design

The design lives in Claude Design and cannot be fetched here — `DesignSync` needs
an interactive login. Compare `kitchen.design` against the layout in
its `README.md` and **ask the user to upload
exactly the files still missing**, naming each:

- `<Design Name>.dc.html` — the export, one per design
- `support.js` — the dc-runtime, shared by every design
- `_ds/<design-system-id>/` — `fonts.css` plus its font files,
  `colors_and_type.css`, `styles.css`, `_ds_bundle.js`

They come from Claude Design: export the file, or "Send to Claude Code Web" to
seed the whole bundle. Commit what arrives.

An export that replaces one already committed redraws screens that
`DEVIATIONS.md` in `kitchen.design` may hold rows for. Read every row for a
screen the new export changed, beside the new artboard, and delete the ones it has made untrue —
the design caught up with the app, or redrew the element. Same commit as the export. An `ID` is
never reused.

A missing `_ds/` renders the design with fallback fonts, undefined custom
properties and empty component boxes, making colour, type and component findings
downstream unreliable. Ask for it; where the user goes without, carry that caveat
onto the map in step 6.

Done when the design serves:

```bash
DESIGN_URL=$(.claude/kitchen/scripts/design-server.sh start)
```

### 3. Build the two verified lists

Nothing outside these lists reaches a ticket.

**Routes** — Expo Router, under `kitchen.expo.routesDir`. Route groups like `(public)`
are not URL segments, and `_layout.tsx` is not a route:

```bash
ROUTES=$(node .claude/kitchen/scripts/kitchen.mjs get expo.routesDir)
find "$ROUTES" -name '*.tsx' ! -name '_layout.tsx' \
  | sed -e "s|$ROUTES||" -e 's|\.tsx$||' -e 's|/([^/)]*)||g' \
        -e 's|/index$|/|' -e 's|^$|/|' \
  | sort
```

A route from outside `kitchen.expo.routesDir` is not a screen and does not belong on a ticket.

**States** — a design with no rail has no chips. It is a phone-sized page, shot at the
default `kitchen.expo.viewport` (never `--desktop`), and every state is reached by clicking an element's
`data-act`. `STATES.md` in `kitchen.design` is the state map: each
`data-screen-label` and the `--act` sequence that reaches it.

```bash
node .claude/kitchen/scripts/capture.mjs \
  --url "$DESIGN_URL/<Design Name>.dc.html" --out .claude/tmp/shots/state.png \
  --act add:open --act go:analysis \
  --wait-for '[data-screen-label="07 Image analysis"]'
```

Record each state as the map names it (`07b Sentence`) and confirm the label appears in the
`.dc.html` — a label absent from source is a misread. An older export that still renders a rail
takes `--desktop` and `--click` by chip text; say so, because that artboard is not phone-sized.

Done when both lists are read rather than recalled.

### 4. Match screens to tickets

Match on what a ticket builds. A screen may own no route — a word-detail modal is a
state of `/post/[id]`, not a route of its own — and several tickets may build into one
screen.

Both mismatches are the findings worth having: **screens with no ticket**
(designed, nobody building it) and **UI tickets with no screen** (being built,
nobody designed it). A ticket with no UI surface gets no contract; name it and
say why.

### 5. Write the contract onto each UI ticket

Re-read the ticket body immediately before writing — concurrent Wayfinder
sessions edit the tracker. Replace any existing `## Design` section in place,
heading to next `##`, so the ticket carries exactly one.

The shape is fixed; `/evidence` and `/design-review` parse it:

```markdown
## Design

**Screen:** `06 · Video` in `<kitchen.design>/<Design Name>.dc.html`
**Route:** `/post/[id]`
**Auth:** signed in

**Reach it in the app:**

1. Sign in with Google
2. Open `/post/mock-video-1`

**Reach it in the design:**

1. Click the `06 VIDEO` chip
```

**Auth** is `signed out` or `signed in`, nothing finer. This repo has no mock-login
fixture and no seeded personas — sign-in is real Google OAuth, so a headless capture
cannot produce a session on its own. A `signed in` screen is reachable only from a
`--state` file a human signed in to make once, and where none exists that screen goes
to the report as uncaptured rather than being guessed at.

**Reach it in the app** carries real fixture ids, plus the in-app steps that reach the
state when the screen owns no route. Where
the `README.md` in `kitchen.flows` already maps the route to a flow,
name that flow as the step — `Run <kitchen.flows>/flows/home.yaml` — rather than listing taps
the flow would only contradict later. **Reach it in the design** names the chip in
backticks exactly as captured, since that string is the chip `shoot-design.sh` clicks; use the numbered form where the bare label matches twice.

Several screens repeat the whole block, in the order a user meets them,
separated by `---`.

Done when every UI ticket carries a contract a sub-agent could act on alone.

### 6. Index the screens on the map

The map points, it does not restate. Add or replace one `## Screen index` — the
design's path, a `Chip | Route | Ticket` table naming every ticket, any `_ds/`
caveat from step 2, and both mismatch lists from step 4.

### 7. Report

```bash
.claude/kitchen/scripts/design-server.sh stop
```

To the user, not the tracker: the screen index, both mismatch lists, every ticket
that got no contract and why, and any design file still missing.

## Bounds

Writes to the tracker and `kitchen.design` only. `## What to build` and
`## Acceptance criteria` stay as `/to-tickets` wrote them.
