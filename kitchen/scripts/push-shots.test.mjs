import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, it } from "node:test";

import { load } from "./kitchen.mjs";

const SCRIPT = new URL("./push-shots.sh", import.meta.url).pathname;
const REPO = load().repo;
const ALIAS = "someone-else/old-name";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function pointOrigin(work, bare, url) {
  git(work, "remote", "set-url", "origin", url);
  git(work, "config", `url.${bare}.insteadOf`, url);
}

function pushShots(cwd, pr, dir, env = {}) {
  return spawnSync(SCRIPT, [String(pr), dir], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function rows(result) {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => line.split("\t"));
}

describe("push-shots.sh", () => {
  let root;
  let origin;
  let work;
  let shots;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "push-shots-"));
    origin = join(root, "origin.git");
    work = join(root, "work");
    shots = join(root, "shots");
    git(root, "init", "-q", "--bare", origin);
    git(root, "clone", "-q", origin, work);
    git(work, "config", "user.name", "t");
    git(work, "config", "user.email", "t@example.com");
    pointOrigin(work, origin, `https://github.com/${REPO}`);
    mkdirSync(shots);
    writeFileSync(join(shots, "home-before.png"), "before");
    writeFileSync(join(shots, "home-after.png"), "after");
  });

  it("prints a sha-pinned URL per shot, and the branch holds the files under <pr>/", () => {
    const printed = rows(pushShots(work, 7, shots));
    const tip = git(origin, "rev-parse", "evidence/7");
    assert.deepEqual(printed, [
      ["home-after.png", `https://github.com/${REPO}/blob/${tip}/7/home-after.png?raw=true`],
      ["home-before.png", `https://github.com/${REPO}/blob/${tip}/7/home-before.png?raw=true`],
    ]);
    assert.equal(git(origin, "show", "evidence/7:7/home-after.png"), "after");
  });

  it("leaves the working tree and the current branch alone", () => {
    assert.equal(git(work, "status", "--porcelain"), "");
  });

  it("has no parent on the first push", () => {
    assert.equal(git(origin, "rev-list", "--count", "evidence/7"), "1");
  });

  it("parents a later lap on the branch's tip, keeping the earlier URLs' commit reachable", () => {
    const first = git(origin, "rev-parse", "evidence/7");
    writeFileSync(join(shots, "home-after.png"), "after, lap 2");
    const printed = rows(pushShots(work, 7, shots));
    const second = git(origin, "rev-parse", "evidence/7");
    assert.notEqual(first, second);
    assert.equal(git(origin, "rev-parse", `${second}^`), first);
    assert.ok(printed[0][1].includes(second));
  });

  it("keeps the earlier push's shots on the branch and replaces one of the same name", () => {
    const first = join(root, "carry-first");
    const second = join(root, "carry-second");
    mkdirSync(first);
    mkdirSync(second);
    writeFileSync(join(first, "flow-after.png"), "first after");
    writeFileSync(join(first, "flow-before.png"), "first before");
    writeFileSync(join(second, "flow-after.png"), "second after");
    writeFileSync(join(second, "other-after.png"), "other");
    rows(pushShots(work, 13, first));
    const printed = rows(pushShots(work, 13, second));
    assert.deepEqual(
      printed.map(([name]) => name),
      ["flow-after.png", "other-after.png"],
    );
    assert.equal(
      git(origin, "ls-tree", "--name-only", "evidence/13:13"),
      "flow-after.png\nflow-before.png\nother-after.png",
    );
    assert.equal(git(origin, "show", "evidence/13:13/flow-after.png"), "second after");
    assert.equal(git(origin, "show", "evidence/13:13/flow-before.png"), "first before");
  });

  it("refuses a directory with no PNG", () => {
    const empty = join(root, "empty");
    mkdirSync(empty);
    assert.notEqual(pushShots(work, 7, empty).status, 0);
  });

  it("hosts a folder holding only failure shots, which is what a Before for a feature not built yet is", () => {
    const failing = join(root, "failing");
    mkdirSync(failing);
    writeFileSync(join(failing, "flow-failure-before.png"), "stopped");
    writeFileSync(join(failing, "flow-failure-after.png"), "stopped too");
    const printed = rows(pushShots(work, 8, failing));
    assert.deepEqual(
      printed.map(([name]) => name),
      ["flow-failure-after.png", "flow-failure-before.png"],
    );
    assert.equal(git(origin, "show", "evidence/8:8/flow-failure-before.png"), "stopped");
  });

  it("takes a ssh-form origin for the same repo", () => {
    const other = join(root, "ssh-work");
    git(root, "clone", "-q", origin, other);
    git(other, "config", "user.name", "t");
    git(other, "config", "user.email", "t@example.com");
    pointOrigin(other, origin, `git@github.com:${REPO}.git`);
    const printed = rows(pushShots(other, 9, shots));
    assert.ok(printed[0][1].startsWith(`https://github.com/${REPO}/blob/`));
  });

  it("takes the repo's name in any case, and prints the kitchen's own spelling", () => {
    const other = join(root, "case-work");
    git(root, "clone", "-q", origin, other);
    git(other, "config", "user.name", "t");
    git(other, "config", "user.email", "t@example.com");
    pointOrigin(other, origin, `https://github.com/${REPO.toLowerCase()}`);
    const printed = rows(pushShots(other, 10, shots));
    assert.ok(printed[0][1].startsWith(`https://github.com/${REPO}/blob/`));
  });

  describe("an origin that is not kitchen.json's repo", () => {
    let alias;
    let result;

    before(() => {
      alias = join(root, "alias.git");
      git(root, "init", "-q", "--bare", alias);
      const other = join(root, "alias-work");
      git(root, "clone", "-q", alias, other);
      git(other, "config", "user.name", "t");
      git(other, "config", "user.email", "t@example.com");
      pointOrigin(other, alias, `https://github.com/${ALIAS}`);
      result = pushShots(other, 11, shots);
    });

    it("fails, naming the origin it found and the repo it wanted", () => {
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes(ALIAS), result.stderr);
      assert.ok(result.stderr.includes(REPO), result.stderr);
    });

    it("pushes nothing to the alias", () => {
      assert.equal(git(alias, "branch", "--list", "evidence/*"), "");
    });

    it("prints no URL, the alias's or any other", () => {
      assert.equal(result.stdout, "");
    });

    it("is not talked round by EVIDENCE_REPO", () => {
      const other = join(root, "alias-work");
      const talked = pushShots(other, 11, shots, { EVIDENCE_REPO: REPO });
      assert.notEqual(talked.status, 0);
      assert.equal(talked.stdout, "");
      assert.equal(git(alias, "branch", "--list", "evidence/*"), "");
    });
  });

  it("is not talked into another repo's URLs by EVIDENCE_REPO", () => {
    const printed = rows(pushShots(work, 12, shots, { EVIDENCE_REPO: ALIAS }));
    assert.ok(printed[0][1].startsWith(`https://github.com/${REPO}/blob/`));
  });
});
