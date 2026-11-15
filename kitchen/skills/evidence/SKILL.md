---
name: evidence
description: The Design/Before/After shots a PR hands over — every screen the diff reaches, shot on the base and on the branch, beside its design and the steps that took them. Use when a PR needs evidence a change works, or as /pick-up-ticket's camera phase, before /design-review.
---

A diff is a claim. A **pair** — one screen shot on the base and on the branch, beside the
**steps** that took both — is the proof. Beside it sits the **Design** shot: the same screen in
the design it was built from, so a reader sees what it was meant to look like without opening
anything else.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

This is the one camera. [`/design-review`](../design-review/SKILL.md) runs after it and judges
the Design and After shots taken here, taking none of its own
([ADR 0003](../../kitchen/docs/adr/0003-design-review-reads-evidences-shots.md)).

One session does all of it — stands the app up, shoots, hosts the shots and writes the table
into the PR body. Every shot lives on `evidence/<pr>` of `kitchen.repo`, and no other host holds
one ([ADR 0023](../../../docs/adr/0023-proof-is-hosted-on-this-repo-or-it-is-code.md)). No runner
sits anywhere in the path: the dictionary a session cannot reach is replaced by a local one it
starts itself, and step 3 says what that holds.

Every PR carries one, a refactor included: its **blast radius** is the screens exercising the
code it changed, and showing those still working is the whole of what it can prove.

There is no PR this skips and none it hands over unphotographed. A diff reaching no route
shoots the **smoke screen** instead, and a step that fails reads
[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md) — symptom, cause and fix for every blocker already met — before
it writes `blocked`. `blocked` is what is left when no row there answers, and it posts too:
the reason, where the PR would have carried the pair.

Whether it works was settled before this ran — [`/implement`](../implement/SKILL.md) took
each acceptance criterion red then green. This phase asks the other question, the dear one:
can a person **see** it working?

Run it in a fresh window. A run that verifies itself reads its own intentions instead of its
output.

## 1. Map the blast radius

`git diff origin/<kitchen.baseBranch>...HEAD --name-only`, read cold — a previous window's summary is the
thing under test. A fresh container clones the branch alone, so `origin/<kitchen.baseBranch>` is no ref
until `git fetch origin <kitchen.baseBranch>` makes it one.

| Changed                                          | Screen it reaches                                   |
| ------------------------------------------------ | --------------------------------------------------- |
| `kitchen.expo.routesDir/**`                      | that route                                          |
| the rest of `kitchen.expo.appDir`                | grep its importers up to a route                    |
| `packages/api/**`                                | the screens calling that procedure                  |
| `packages/*`                                     | the router importing it, then that router's screens |
| `apps/nextjs/src/app/api/**`                     | the screens the changed procedure serves            |
| `tooling/`, `.github/`, `.claude/`, `docs/`      | the smoke screen                                    |
| `kitchen.flows/**`                               | the screens those flows reach, and each changed flow is shot itself |

Three screens is the cap: the route the change is for, and the two nearest it can break. A
file that reaches only the smoke screen says so with its reason — a finding where the issue
claims something a person can see.

Every screen the ticket's design names joins the radius on top of the cap. The design is named
in a `## Design` section or in the ticket's prose — a `.dc.html` and a screen — and
[`/design-review`](../design-review/SKILL.md) step 1 reads it the same way. Design review has no
camera, so a design screen left out here is one it cannot judge.

The **smoke screen** is what a diff reaching no route photographs anyway: the route nearest
the change, else `/home`. It claims one thing, which is the only thing such a diff can
claim — the app still stands. One diff carries no screen at all, the purely textual:

```bash
git diff origin/<kitchen.baseBranch>...HEAD --name-only | node .claude/kitchen/scripts/is-skippable-change.mjs
```

It prints the paths that are not prose, an image or a font. Nothing printed is the one PR
whose comment is a line naming what you checked instead of a pair; a single path printed
puts the smoke screen back.

A change to what a word's definition shows — a sense, gloss, tag, "Other meanings" group or
the English word sheet — reaches a second surface: the same screen with **App language** set to
日本語 (Settings → App language, where the app has it). Shoot the pair in both languages and
name the language in each row's `What`. A definition feature seen only in English has not been
verified for the user who reads the chrome in Japanese.

Recompute this every lap. The radius comes from the diff, and the diff grows as fix commits
land — a list carried over from the last lap misses the screen a fix broke.

Done when every changed file names a screen, every design screen the ticket names is in the
radius, or that command printed nothing.

## 2. Write the steps

The `README.md` in `kitchen.flows` maps a route to the flow that reaches it,
and that flow is what the `Steps` cell carries — one command a reader reruns.

A screen no flow reaches earns a flow, checked in: hand taps prove one run, a flow proves
every run after it.

A flow that reads the dictionary is a flow like the rest. the session's hooks (`.claude/session-up.d`) start a local
Mongo for it, so nothing here sets one apart.

Done when every screen in scope names a flow file.

## 3. Shoot the pair

```bash
rm -rf .claude/tmp/shots/out
.claude/kitchen/scripts/shoot-pair.sh .claude/tmp/shots/out <the flows from step 2>
```

[`shoot-pair.sh`](../../kitchen/scripts/shoot-pair.sh) is the whole of it: database, schema, seed,
both servers and the sign-in via [`session-up.sh`](../../kitchen/scripts/session-up.sh), each backend
step the adapter `kitchen.adapters` names, the flows on
the branch, then the same on the merge-base. The base runs in a throwaway worktree with the
branch's own scripts, hooks and flows laid over it, so the branch's checkout is never touched and a
base older than those scripts still shoots. It leaves `<shot>-after.png` and
`<shot>-before.png` in `.claude/tmp/shots/out/`, and prints
`<flow>  after=<ok|failed>  before=<ok|failed|cached (…)>` for each flow, and exits 1 when any
After failed, once every line is printed. Give it every flow in one call: a call boots the base
once for all of them, and a call per flow pays the install, the seed and Metro each time, which
measured 250 to 390 seconds a call. The Before is cached by merge-base and by the flow file's
content, so a second lap of an unchanged flow re-shoots the After alone and an edited flow
re-shoots its Before. It fetches `origin/<kitchen.baseBranch>` itself when the clone lacks it.

A Before the flow cannot reach **is** the Before: a screen this branch builds answers with a
selector that never appears, and its cell reads `not built`. The same failure on the `after`
side is `blocked`, and so is `session-up failed`.

**Open every shot**, both sides — [`/verify-expo`](../verify-expo/SKILL.md) step 4 says why.
Halves that match, on a diff claiming a visible change, is a finding: either the change never
reached the screen, or the steps never reached the change.

**The dictionary** is a local Mongo that a [`session-up.sh`](../../kitchen/scripts/session-up.sh) hook starts
through [`mongo-up.sh`](../../scripts/mongo-up.sh) and points `MONGODB_URL` at, over the hosted
one the container exports and cannot resolve. It holds the fixture dictionary the checkout's own
`load-fixture-dictionary` writes, and nothing from the real import: a headword outside the fixture
reads as not found, on both halves. A flow whose screen needs a real headword says so in its
`What` cell. The hosted dictionary is never read or written from a session.

Done when every flow printed `after=ok` and every shot has been opened. A flow that printed
`after=failed` is `blocked`, and its failure shot says where it stopped.

## 4. Shoot the design

```bash
.claude/kitchen/scripts/shoot-design.sh <file>.dc.html <desktop|phone> .claude/tmp/shots/out "<chip>" ["<chip>"…]
```

For every screen with a design — the file and chip the contract names. A chip is one click on
an export's rail, shot at `desktop`. A design with no rail is a phone-sized page driven like the
app, so its screens are tap paths — `Start review` — taken from the contract's **Reach it in
the design** steps, joined with `>`, and shot at `phone`, where it lays out as the app does.
It serves `kitchen.design` from the container and needs no app and no database, so it takes
seconds: shoot it every lap rather than carrying it over.

It writes `<slug>-design.png` beside the pair, and prints each path.

| The screen                                                   | Design cell                              |
| ------------------------------------------------------------ | ---------------------------------------- |
| has a design                                                 | the shot                                 |
| the smoke screen, standing in for a diff reaching no screen  | `—`                                      |
| no design names it — no contract, no screen-index match      | `no design`                              |
| the contract names a `.dc.html` not in `kitchen.design`      | `blocked · design not committed`         |

**Open every design shot.** One that is the rail rather than the screen means the chip clicked
nothing or matched twice — [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md#shooting-the-design) has it.

Done when every screen with a design has an opened shot, or a Design cell from the table.

## 5. Host the shots

```bash
.claude/kitchen/scripts/push-shots.sh <pr> .claude/tmp/shots/out
```

[`push-shots.sh`](../../kitchen/scripts/push-shots.sh) commits the folder to the `evidence/<pr>` branch
with git plumbing, so the working tree is untouched, and prints `<file>  <url>` for each shot.
The URL is pinned to that push's commit, so a later lap's shots never change what an earlier
lap's comment shows. A later push for the same PR keeps the earlier push's files on the branch and
replaces one only when a shot of the same name is pushed, so a run taken in two goes — a flow
retaken after a fix — leaves every shot reachable at the branch tip. It renders for anyone signed in to this repo, which is where a PR is read.

Done when it printed a URL for every PNG in the folder.

## 6. Post

Write the evidence table into the PR body, with the agent's own write:

1. `pull_request_read` the body, so the write keeps every other table in it.
2. Build the one table, `What` · `Design` · `Before` · `After` · `Steps`, per
   [`pr-format.md`](../../kitchen/docs/pr-format.md). A shot goes in its cell as
   `<img src="<the URL>" width="320">`, copied from step 5's output. The flow command goes in
   `Steps`, and `not built` or `blocked · <reason>` where a screen has no pair.
3. `update_pull_request` with the body, the table replacing any evidence table already there.
4. `pull_request_read` it back.

The sanitizer strips `![](url)` and escapes `<img>` for a host that is not this repo, and
leaves `kitchen.repo`'s own `github.com/<kitchen.repo>/` URLs alone. So a stripped `!` or an
escaped tag in the read-back means a URL that did not come from step 5: push the shot to
`evidence/<pr>` and write the cell again. A claim with
no shot to show carries a fenced block of the command and its output instead.

[`/post-comment`](../post-comment/SKILL.md) shapes what else the body says. A `blocked` names
its reason in the world, and carries an `Unblock` table where the reader holds what this run
does not — a secret, a device, a signed-in session. A run that reached no pair at all says so
in the short comment in [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md#a-blocker-with-no-row) rather than a
table of empty cells. Close the body's evidence on the **ceiling** — what the surface could
not show — and on the scan: the QR `pr-preview.yml` posted, then the route and the tap that
show the change landed.

Done when the stored body holds one `<img src=` for every shot in step 5's output, none of
them backticked or reduced to a link — or, on the purely textual diff, the one line stands
where the table would.

## 7. Gate the hand-over

```bash
pnpm lint && pnpm format && pnpm typecheck && pnpm test
pnpm drive <kitchen.flows>/checks/<name>.yaml      # each check the ticket's criteria earned
```

Green here, not on trust — the checks included, run again on the head the PR hands over,
because a review fix lands after the lap that turned them green.

Then read each earlier phase's post — `/code-review`, and `/content-review` where the diff
carries user-facing text. A phase with nothing posted is a finding: a pass nobody can tell
happened. Design review runs after this, so it is not one of them.

On a run after a design lap, read the body's gaps table too. Every `deferred` row names an issue,
and that issue carries a comment with the screen's Design and After; every `accepted` row names a
`DEVIATIONS.md` row the branch has. One without is a finding.

Done when the commands are green, every phase has posted, every gap row checks out, and the
verdict is one word.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into — the server that never
answers, the flow with no state file, the database the container cannot reach, the push that
is refused — each with the steps out.
A pair the stack cannot shoot because it lacks a state the ticket needs — a dictionary headword,
an analytics event no deploy has sent, a storage bucket or moderation key — has a row there
too, and `blocked`'s `Next` carries that row's steps, so the reader holds what supplies the state.
Stopping is for a blocker with no row there, and
[its own section](../../kitchen/docs/BLOCKERS.core.md#a-blocker-with-no-row) is what that posts.

## Output

The pair and its Design shot, in the PR body's evidence table, and a receipt —
[`receipt.mjs`](../../kitchen/scripts/receipt.mjs)'s one line, `done`, `findings` or `blocked`, with
the PR's URL.
