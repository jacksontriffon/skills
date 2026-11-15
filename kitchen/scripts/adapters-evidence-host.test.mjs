import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, it } from "node:test";

import { sandbox } from "./adapter-sandbox.mjs";
import { load } from "./kitchen.mjs";

const REPO = load().repo;

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

describe("evidenceHost git-branch: push", () => {
  let work;
  let origin;
  let shots;
  let sandboxed;
  let statusBefore;

  const push = (pr, dir = shots) => sandboxed.dispatch(["evidenceHost", "push", String(pr), dir], { cwd: work });
  const rows = (run) => {
    assert.equal(run.status, 0, run.stderr);
    return run.stdout.trim().split("\n").map((line) => line.split("\t"));
  };

  before(() => {
    const root = mkdtempSync(join(tmpdir(), "evidence-host-"));
    origin = join(root, "origin.git");
    shots = join(root, "shots");
    sandboxed = sandbox({ adapters: { evidenceHost: "git-branch" } });
    work = sandboxed.root;
    git(root, "init", "-q", "--bare", origin);
    git(work, "remote", "add", "origin", `https://github.com/${REPO}`);
    git(work, "config", `url.${origin}.insteadOf`, `https://github.com/${REPO}`);
    statusBefore = git(work, "status", "--porcelain");
    mkdirSync(shots);
    writeFileSync(join(shots, "home-before.png"), "before");
    writeFileSync(join(shots, "home-after.png"), "after");
  });

  it("takes a PR number and a folder of PNGs, and prints a sha-pinned URL for each", () => {
    const printed = rows(push(31));
    const tip = git(origin, "rev-parse", "evidence/31");
    assert.deepEqual(printed, [
      ["home-after.png", `https://github.com/${REPO}/blob/${tip}/31/home-after.png?raw=true`],
      ["home-before.png", `https://github.com/${REPO}/blob/${tip}/31/home-before.png?raw=true`],
    ]);
  });

  it("commits the shots to evidence/<pr> under <pr>/ and leaves the working tree alone", () => {
    assert.equal(git(origin, "show", "evidence/31:31/home-after.png"), "after");
    assert.equal(git(work, "status", "--porcelain"), statusBefore);
  });

  it("keeps an earlier lap's other shots when a later lap pushes one", () => {
    const other = join(tmpdir(), `evidence-host-lap-${process.pid}`);
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, "home-after.png"), "after, lap 2");
    rows(push(31, other));
    assert.equal(git(origin, "show", "evidence/31:31/home-after.png"), "after, lap 2");
    assert.equal(git(origin, "show", "evidence/31:31/home-before.png"), "before");
  });

  it("refuses an origin that is not the repo kitchen.json names, before pushing anything", () => {
    const stray = sandbox({ adapters: { evidenceHost: "git-branch" } });
    git(stray.root, "remote", "add", "origin", "https://github.com/someone-else/old-name");
    const run = stray.dispatch(["evidenceHost", "push", "5", shots], { cwd: stray.root });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /not .*, the repo kitchen\.json names/);
  });

  it("refuses a folder with no PNG", () => {
    const empty = mkdtempSync(join(tmpdir(), "evidence-host-empty-"));
    const run = push(32, empty);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /no PNG/);
  });

  it("is still reachable as push-shots.sh, which the workflows and docs name", () => {
    const run = sandboxed.run(join(sandboxed.root, ".claude/kitchen/scripts/push-shots.sh"), ["33", shots], { cwd: work });
    const printed = rows(run);
    assert.equal(printed.length, 2);
    assert.equal(git(origin, "show", "evidence/33:33/home-after.png"), "after");
  });
});
