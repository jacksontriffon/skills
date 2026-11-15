# Surfaces

Each surface below carries what it needs, how to stand it up, and its **ceiling** —
the behaviour it cannot show, whatever the code does. Read the ceiling before the
commands: it is what step 5 of [`SKILL.md`](SKILL.md) reports as out of scope.

Surfaces are ordered by fidelity. Where one is unavailable, drop to the one above and
say which you used.

| Surface               | Live here?                                   | Loop                | Cost                |
| --------------------- | -------------------------------------------- | ------------------- | ------------------- |
| Expo web              | yes                                          | ~1 min              | free                |
| Expo web (CI)         | yes, dispatched                              | ~15 min             | Actions minutes     |
| Android emulator (CI) | needs a job in the workflow                  | ~15 min             | Actions minutes     |
| iOS simulator (CI)    | parked — needs `ENABLE_IOS_JOB`              | 27–48 min, measured | Actions minutes ×10 |
| Real device (farm)    | needs an account and secrets                 | ~10 min             | per-minute billing  |
| Your own iPhone       | needs an Apple account, then ~20 min a build | manual              | $99/year            |

## Expo web

React Native Web through Metro. The only surface that runs in an agent container:
`/dev/kvm` is absent and there are no `vmx`/`svm` flags, so an emulator here falls
back to software QEMU and never finishes booting. macOS is absent too, which rules
out the iOS Simulator permanently.

Starting the API the app needs is the `stack` adapter's job (`kitchen.adapters.stack`);
`dev-server.sh` runs it and starts Metro beside it.

```bash
APP_URL=$(.claude/kitchen/scripts/dev-server.sh start)
node .claude/kitchen/scripts/capture.mjs --url "$APP_URL/" \
  --out .claude/tmp/shots/landing.png --wait-for "text=<a string only this screen has>"
.claude/kitchen/scripts/dev-server.sh stop
```

`dev-server.sh` starts Metro **and** the API (through `stack up`), because the app's base-URL resolver sends
auth and data calls to the API's port. Metro alone serves the landing screen and nothing
past it.

The API validates `.env` before it boots, and `stack up` copies `.env.example` when there is
no `.env`, which is enough for it to return. The stand-in values go to the backing services
verbatim. Anything past a render needs real credentials.

An agent container runs this surface itself. [`session-up.sh`](../../kitchen/scripts/session-up.sh)
prepares the database (`db prepare`), runs the project's hooks, seeds the account (`auth seed`), starts both
servers and signs in (`auth sign-in`);
[`shoot-pair.sh`](../../kitchen/scripts/shoot-pair.sh) drives a flow on the branch and on its merge-base.
[`/evidence`](../evidence/SKILL.md) is that route end to end, and a session needs no runner and no
other host for what it shot.

A screen that reads the dictionary shoots there too. Hosted Mongo does not resolve from a
container, so a `session-up.sh` hook starts a local one through
[`mongo-up.sh`](../../scripts/mongo-up.sh), loads the checkout's fixture dictionary into it, and
exports its URL over the hosted one the container carries. What it holds is the fixture, not the
real import.

[`shoot-expo-web.yml`](../../../.github/workflows/shoot-expo-web.yml) is a person's way to shoot a
flow on a runner, and no skill dispatches it. A cold runner is far slower than a warm
workstation, so its selectors want longer than the 15s `drive.mjs` defaults to: that workflow
asks for 60s.

Signed-in screens need `.claude/tmp/auth.json`. Producing one without a browser is the `auth`
adapter's job (`kitchen.adapters.auth`): `sign-in`, once the API is started with `AUTH_DEV_LOGIN=1`,
and `seed` runs the project's seed, which writes the account it signs in as, along with a study list that renders as content rather than an
empty state. What that flag will and will not open the path against, and what the seed
requires before it writes, are in [`fixtures/README.md`](../../../fixtures/README.md).

```bash
echo 'AUTH_DEV_LOGIN=1' >> .env      # the stack adapter starts the API through dotenv
APP_URL=$(.claude/kitchen/scripts/dev-server.sh start)
node .claude/kitchen/scripts/adapter.mjs auth sign-in
node .claude/kitchen/scripts/capture.mjs --url "$APP_URL/home" \
  --state .claude/tmp/auth.json --out .claude/tmp/shots/home.png
```

How the session travels is the `auth` adapter's too. On web it is a browser cookie
rather than the Expo client's own store, because the auth client's Expo plugin returns early
on `Platform.OS === "web"`. Two things have to be true for the app to send it: the data
client asks for `credentials: "include"`, and the API reflects a loopback origin with
`Access-Control-Allow-Credentials` while the sign-in path is open — a wildcard origin
cannot carry credentials. Cookie scope ignores the port, so one cookie on `localhost`
covers both Metro and the API; a tunnelled API on another host will not receive it.

The auth routes set no CORS headers, so the app cannot _perform_ sign-in on web — only
carry a session it was handed. Native surfaces need the cookie in the Expo client's
SecureStore instead, which a headless fixture does not write.

One `react-dom` has to survive the hoist or every route mounts nothing, and the shot
comes back blank on an exit code of 0. Declare `react-dom` next to `react` in the shared UI
package to hold it at the catalog version: a peer no importer claims resolves to the newest
match, which the workspace's `overrides` block does not constrain.

**Ceiling.** Safe-area insets and notch behaviour · native font metrics and text
rendering · `elevation` versus `box-shadow` · keyboard avoidance · scroll physics and
bounce · status bar · anything behind a native module, which renders as a gap.

## Android emulator, on GitHub Actions

Standard `ubuntu-latest` runners carry KVM once the udev rule is in place — GitHub
extended hardware acceleration to 2-vCPU runners in April 2024, where it had been
4-vCPU and larger before.

**Ceiling.** Stock Android only, so no OEM skin · emulator timing rather than device
timing · no real camera or sensors · GPU behaviour differs from a phone.

## iOS simulator, on GitHub Actions

The `ios` job of [`.github/workflows/verify-expo.yml`](../../../.github/workflows/verify-expo.yml).
Dispatch it, poll it, and read the shot URLs out of the run — no artifact download, and
nothing about it needs macOS on your side.

**It may be parked.** The job carries `vars.ENABLE_IOS_JOB == 'true'`, and where that
repository variable is unset a dispatch runs `flows` and skips `ios`. Each attempt spends
27-48 minutes of `macos-latest` at 10×, so a project parks it until a run there succeeds. The
project's own [`BLOCKERS.md`](../../BLOCKERS.md) says whether it is parked and why, and the
kitchen's [`BLOCKERS.core.md`](../../kitchen/docs/BLOCKERS.core.md) carries the rows every Expo
repo meets.

While it is parked, reach for an **EAS cloud build** below instead: it builds on Expo's
infrastructure rather than GitHub's macOS runners, and hands back a link to install. Set
`ENABLE_IOS_JOB=true` under Settings → Secrets and variables → Actions → Variables to bring
this surface back — one click, nothing to re-write.

```
workflow: verify-expo.yml   ref: <your branch>
inputs:   platform=ios  flow=<kitchen.flows>  shot-prefix=<issue number>
```

`gh workflow run verify-expo.yml --ref <branch> -f platform=ios -f shot-prefix=<issue number>` on a
workstation; through the GitHub MCP tools it is `actions_run_trigger`, then `actions_list`
or `actions_get` to poll and `get_job_logs` to read the URLs back.

A `workflow_dispatch` workflow becomes dispatchable only once its file is on the default
branch — after that, `--ref <branch>` runs whichever version that branch carries. So the
first dispatch of this job cannot happen until it merges, and a run against a branch that
edits it exercises the branch's copy. That is the first thing to check when the workflow
does not appear at all.

A `flows` job on `ubuntu-latest` gates this one: it parses every file under `kitchen.flows`
with the same pinned Maestro CLI, and the `ios` job never starts if one is refused. A flow
Maestro cannot read used to cost a whole build to discover, because a parse error is
file-level and the default `flow: <kitchen.flows>` boots every flow together.

`flow` takes any path under `kitchen.flows`; the default
`kitchen.flows` itself runs every flow in one boot, which is the right default because the build, not
the driving, is what the run costs. The shots are pushed to `evidence/<pr>` by `push-shots.sh`, one `ios-<shot>.png` per
`takeScreenshot`, listed as links in the run summary and as URLs in the step log.

**What a human adds to the repo,** under Settings → Secrets and variables → Actions: every
secret and variable the job needs, which the guard step below names when one is missing. The
project's own list is in the workflow, and the stack and auth adapters (#985) name the rest.

Public values (the `NEXT_PUBLIC_*` family) go on the **Variables** tab, never Secrets: the
runner masks every secret a job can see out of that whole job's log, so a shot URL built from
one prints as `***/storage/v1/object/public/…`, with no host to fetch it by. These values
already ship inside the client bundle, so nothing is exposed by moving them. If the URLs do
come back masked, someone put one of them on the Secrets tab.

The job refuses before it builds if any is unset, naming the missing ones and keeping
secrets and variables apart so it is clear which tab to look at. The guard exists because
the API's env schema is skipped whenever `CI` is set, so a missing value would otherwise
surface as a failing request an hour into the run rather than as a failing step. The Expo
token is there because `eas.json` sets `appVersionSource: "remote"`, so even a `--local`
build resolves the version against EAS — it is an Expo account token, not an Apple one, and
a simulator build still needs no Apple Developer account.

A value carrying a single quote is refused too: the job writes `.env` for two readers
that disagree about escaping one — the shell `source`s the file and Next.js parses
it through dotenv — so a value it cannot write for both is a hard stop.

**The app is not standalone here either.** The job starts the API on the runner and
waits for it to answer before it builds, because the app's base-URL resolver sends auth and
data calls to the API's port.

`hostUri` does not answer for it. A `preview` build is a Release build with its bundle
embedded, so it never attaches to Metro and `Constants.expoConfig.hostUri` is unset —
the base-URL resolver reaches its fallback and throws. `kitchen.expo.apiUrlEnv` therefore has to be
set explicitly and inlined at bundle time, which is two places rather than one:
`eas.json` in `kitchen.expo.appDir` carries it on the `preview` profile, because EAS resolves a build's
environment from the selected profile rather than from the shell that invoked it, and the
workflow also sets it in the ambient environment. `http://localhost:3000` is the value:
the simulator shares the runner's loopback, so the app's localhost is the runner's
localhost. The install step greps the extracted bundle for that string and fails the run
if it is absent, because a bundle missing it fails every flow on its first assertion
instead of failing where the mistake is. Unverified in the same breath: iOS App Transport
Security has to permit the plaintext hop, which Expo's prebuild template covers with
`NSAllowsLocalNetworking`, and no run has confirmed that yet.

**Cost.** macOS minutes bill at 10× on a private repo. Measured across three runs with
identical inputs, wall clock ran 27–48 minutes, and the **Build the simulator app** step — the
local EAS build: `expo prebuild`, `pod install`, then a Release `xcodebuild` archive via
fastlane — was 79–82% of it. The Xcode archive alone is 88–90% of that step; prebuild is
under a tenth, not the "mostly prebuild" assumed going in. A project's own measured runs
belong in its `BLOCKERS.md`.

Caching CocoaPods' download cache and Xcode's DerivedData, keyed on the lockfile and the
app's config files, halves the pod install and does nothing for the archive: a Release
archive via `xcodebuild`/fastlane gets little from a warm DerivedData, Hermes bytecode
compilation is a fixed cost every run pays, and run-to-run variance on the shared macOS fleet
(74% between two nominally identical cold runs) is larger than any saving. Split restore and
save steps for the cache, so a failing unrelated step does not skip the save. Cutting the
archive itself means one of two levers: EAS cloud builds (trading Actions minutes for EAS
credits) or committing the prebuild output.

**Ceiling.** Simulator timing rather than device timing · no real camera or sensors ·
Metal behaviour differs from a phone · Dynamic Island and haptics unmodelled · **no
session**: the flows tagged `signed-in` reach `/home` by deep link, and no signed-in
screen calls tRPC yet, so the shots are of screens drawing static content. A native
session lives in the expo client's SecureStore, which nothing writes and `xcrun simctl
keychain` cannot inject, so the job sets `AUTH_DEV_LOGIN=1` to leave the API's headless
path open and no step yet walks through it.

## The Android job the workflow still needs

`verify-expo.yml` has no `android` job, and its `platform` input offers only `ios` until
one exists. This is the shape it takes:

```yaml
android:
  if: inputs.platform == 'android'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v5
    - uses: ./tooling/github/setup
    - name: Enable KVM
      run: |
        echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' \
          | sudo tee /etc/udev/rules.d/99-kvm4all.rules
        sudo udevadm control --reload-rules
        sudo udevadm trigger --name-match=kvm
    - run: cd <kitchen.expo.appDir> && npx expo prebuild --platform android
    - uses: reactivecircus/android-emulator-runner@v2
      with:
        api-level: 34
        arch: x86_64
        script: |
          adb install <kitchen.expo.appDir>/android/app/build/outputs/apk/debug/app-debug.apk
          maestro test <kitchen.flows> -e LINK_PREFIX=<kitchen.expo.scheme>:/
```

Take the `.env`, API-start and upload steps from the `ios` job as they are; the emulator
reaches the runner's API on `10.0.2.2` rather than on loopback, so
`kitchen.expo.apiUrlEnv` differs.

One trap not to inherit: a `pull_request` filter of `["*"]` skips every stacked branch,
because `*` does not match `/` in a GitHub branch filter. `verify-expo.yml` is
`workflow_dispatch` only, which sidesteps it, and `.github/workflows/ci.yml` already uses
`["**"]` — match that before giving either one a `pull_request` trigger.

## Driving past the launch screen

Every surface above screenshots whatever the app opens on, and all but one route sits
behind a tap. The taps are checked in as [Maestro](https://maestro.dev) flows under
`kitchen.flows`, whose `README.md` maps a route to the flow that reaches
it and to the shots it takes — so a `## Design` contract's **Reach it in the app** steps
name a flow rather than repeating its taps.

```bash
APP_URL=$(.claude/kitchen/scripts/dev-server.sh start)
pnpm drive <kitchen.flows>/flows/<name>.yaml  # shots land in .claude/tmp/shots/
```

Maestro runs the same files against an emulator, a simulator and a physical iPhone; on
web `.claude/kitchen/scripts/drive.mjs` runs them through Playwright. Why it has to, what the
two surfaces disagree about, and what a flow tagged `signed-in` needs before it will
open a browser are all in that README.

**Ceiling.** These flows navigate and screenshot — nothing asserts behaviour. Gestures
are not modelled either: a sheet that answers a swipe is reached through a control
instead. No flow here has been run by Maestro itself, so the native
half of the claim is written rather than demonstrated.

## Real devices

BrowserStack App Automate, Firebase Test Lab, AWS Device Farm and Appetize all expose
REST APIs and take an EAS build. Each needs an account and a secret in the repo.

**Ceiling.** Still not the device your user holds — and per-minute billing makes it a
gate for a release, rather than something to reach for on a change.

## Your own iPhone, on a development build

The highest-fidelity surface available, and the only one that answers the camera and the
on-device OCR module. Needs an Apple Developer Program membership and the device
registered against it; the `development` profile in `eas.json` under `kitchen.expo.appDir` is
otherwise ready as written.

The project's own docs carry the ordered checklist, including the account wait that gates
it.

Remember the app is not standalone — its base-URL resolver sends auth and data calls to the
API's port, so the API has to be up and reachable _from the phone_. A tunnel
beats the LAN fallback, and OAuth needs one.

**Ceiling.** Only the hardware in your hand · no agent can drive it, so every step is
manual and no shot is automatic · the v1 client is fixtures, so nothing past layout,
native rendering and the OCR module is under test at all.

## A native change, and the build that carries it

Native code reaches a phone only in a **build**. `eas update` and the PR-preview QR carry
the JS bundle and nothing else, and `runtimeVersion` is `appVersion` against a hand-bumped
`version`, so a bundle needing a new module installs onto a binary that cannot have it
instead of being refused. On screen that reads
`Cannot find native module 'X', js engine hermes` — a red screen, not the app's own typed
refusal, because `requireNativeModule` runs when the route evaluates.

So bump `version` in `app.config.ts` under `kitchen.expo.appDir` whenever native linkage changes, then build:

```bash
cd <kitchen.expo.appDir> && pnpm dlx eas-cli@latest build --platform ios --profile development --non-interactive --no-wait --json
```

`eas build` evaluates the app config locally, so the worktree needs its own
`node_modules` — `pnpm install --frozen-lockfile` first, in a fresh worktree.

### A green build is not evidence the native code is in it

Autolinking drops a pod the target cannot satisfy — a podspec platform above the app's
deployment target, say — through `Pod::UI.message`, which CocoaPods prints only under
`pod install --verbose`. Three builds went green with the module missing from them, and its
Swift held a compile error nobody could see because no compiler had read it.

Require two lines from the log before claiming a module is in a build:

| Line                           | Phase          | Says                                  |
| ------------------------------ | -------------- | ------------------------------------- |
| `Installing <Pod> (<version>)` | `INSTALL_PODS` | autolinking kept the pod              |
| `Compiling <File>.swift`       | Xcode          | the compiler actually read the source |

`eas build:view --json` returns nothing on eas-cli 22.x. Fetch the logs from GraphQL —
POST `https://api.expo.dev/graphql` with an `expo-session` header read from
`~/.expo/state.json` (`%USERPROFILE%` on Windows), querying
`builds { byId(buildId: $id) { status logFiles } }`. Two URLs come back, the Xcode log and
a JSON-lines log of every phase, and **both are brotli**, not gzip. When a file's presence
on the worker is in doubt, `builds { byId { projectMetadataFileUrl } }` returns
`archiveContent` — the exact list the worker received — which settles it without guessing
at `.gitignore`. For what no log answers, an `eas-build-pre-upload-artifacts` script in
the app's `package.json` runs after `pod install` and can print `Podfile.lock` or the
generated `ExpoModulesProvider.swift`.

### Hand over the link

No agent installs on hardware and the container's disk does not survive, so a verification
that needed a build ends with its **download link** — `artifacts.buildUrl`, or the build
page — posted on the issue or PR. Say which log lines the claim rests on, and say plainly
that installing it answers only what compiled; whether the native path _works_ is still the
iPhone surface above.

Never hand over a preview QR for a native change. It carries no native code, and the
PR-preview guard refuses one anyway once the diff touches `ios/`, `android/`, an
`expo-module.config.json`, `app.config.ts`, or a dependency.
