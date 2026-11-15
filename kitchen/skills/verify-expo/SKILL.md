---
name: verify-expo
description: Verify the Expo app renders and behaves on a real surface — Expo web, an emulator, a simulator, or a device — and say what that surface could not show. Use when the user wants a change seen working, a screenshot of a screen, or asks whether something holds on iOS or Android; or when another skill needs the app stood up.
---

A verification is a claim about a **surface**. Expo web, an emulator, a simulator, a
device — each shows part of the app and hides the rest, and what it hides is its
**ceiling**.

`kitchen.<key>` is a value from [`.claude/kitchen.json`](../../kitchen.json), as the session brief prints it.

A shot on its own therefore proves nothing. A shot, plus the surface it came from,
plus that surface's ceiling, is a verification.

Every run of this skill ends one of two ways: a shot showing the change landed as
expected, or `blocked`, naming what stopped you from getting one. There is no third
outcome — not a caveat buried in prose, not a `done` that means "probably."

[`SURFACES.md`](SURFACES.md) carries each surface: what it needs, how to stand it up,
and where its ceiling sits.

## 1. Pick the surface

The question decides it:

| The question | Surface |
| --- | --- |
| Does the layout, copy, or flow hold? | Expo web |
| Does it hold with native text, safe area, shadows, keyboard? | Android emulator |
| Does it hold on iOS specifically? | iOS simulator |
| Does it hold on real hardware — OEM skin, real fonts, real timing? | device farm |

Reach for web wherever web can answer it. It costs a minute; every surface below it
costs tens of them, and a fast answer that arrives is worth more than a thorough one
that gets skipped.

A **native change** is different in kind: no surface an agent can drive contains it, and
no update or QR code carries it. It needs a build, the evidence is that build's log rather
than its exit status, and the hand-over is the build's download link — see
[A native change](SURFACES.md#a-native-change-and-the-build-that-carries-it).

Done when the surface is named and its ceiling has been read.

## 2. Stand it up

Follow that surface's section in `SURFACES.md`.

A surface whose prerequisites this repo has yet to meet says so in its section. Name
the gap, drop to the surface below, and label the result for the surface you actually
used — a smaller claim, stated honestly, beats a missing one.

Done when the surface answers: a URL that serves, or a booted device id.

## 3. Drive to the screen

Reach the state under test — sign-in, navigation, seeded data — running each step
rather than assuming it.

An unattended run stops at the launch screen. Everything worth looking at sits behind
a tap, so the driving *is* the work.

The taps are checked in: the `README.md` in `kitchen.flows` maps each
route to the flow that reaches it, and `node .claude/kitchen/scripts/drive.mjs <kitchen.flows>/flows/<name>.yaml` runs one.
A screen no flow reaches yet earns a flow, which costs less than driving it by hand
twice.

Done when every screen in scope has been reached by steps that ran.

## 4. Capture

One shot per screen. A flow's `takeScreenshot` steps have already taken theirs, into
`.claude/tmp/shots/`; `capture.mjs` is for the one-off a flow does not cover.

**Open every shot.** A blank page, a login screen, an empty list — each exits 0 and
each looks like a result. A shot nobody has looked at is not evidence.

A blank shot means the app failed to mount, which makes it a broken capture: find out
why and report that, so a screen that was built correctly is never written up as
wrong.

A shot that opens but doesn't show the change under test — the old copy, the old layout,
the feature nowhere on screen — is not evidence either. That's `blocked`, named with what
you saw instead of what you expected, not a shot posted anyway because one exists.

Done when every shot has been opened and shows the screen it names, or the run has
stopped at `blocked`.

## 5. Report

Lead with the surface. Then what held, what did not, and **what this surface could not
show** — its ceiling, listed as out of scope, so the report is never mistaken for a
full check.

Behaviour the ceiling covers is the surface working correctly, not a defect: a native
module rendering as a gap on web is web being web.

Where the claim rests on a build, carry its **download link**, and rest the claim on the
`Installing <Pod>` and `Compiling <File>.swift` lines rather than on the build going green
— a build that silently dropped the pod is green too.

A surface that never came up, a screen the driving never reached, or a shot that came
back not showing the change — each of those is `blocked`, stated as such, not folded into
a report that reads like a pass.

Done when every claim names the surface it rests on, or the run has named what blocked it.

## Stuck

[`BLOCKERS.md`](../../BLOCKERS.md) and [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md), searched for the error's words and never read whole, carry what these steps run into, each with the steps
out. Stopping is for a blocker with no row there.

## Output

The shot, the surface it came from, and that surface's ceiling — or `blocked`, naming what
stopped you getting one. A shot without the other two is not a verification.
