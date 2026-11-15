import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, it } from "node:test";

import { at, ROOT as REAL } from "./layout.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function write(path, body, mode) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
  if (mode) chmodSync(path, mode);
}

const DRIVE_STUB = `import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const [flow, , shots] = process.argv.slice(2);
const name = basename(flow, ".yaml");
const side = process.cwd().includes("shoot-pair-base") ? "before" : "after";
appendFileSync(process.env.STUB_LOG, side + " " + name + "\\n");
mkdirSync(shots, { recursive: true });
const failing = (process.env["STUB_FAIL_" + side.toUpperCase()] ?? "").split(",");
if (failing.includes(name)) {
  writeFileSync(join(shots, name + "-failure.png"), side + " failure of " + name);
  process.exit(1);
}
writeFileSync(join(shots, name + ".png"), side + ":" + readFileSync(flow, "utf8"));
`;

function setup(root) {
  const origin = join(root, "origin.git");
  const seed = join(root, "seed");
  const work = join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, seed);
  git(seed, "config", "user.name", "t");
  git(seed, "config", "user.email", "t@example.com");
  const scripts = join(".claude", "kitchen", "scripts");
  mkdirSync(join(seed, scripts), { recursive: true });
  for (const file of ["shoot-pair.sh", "kitchen.mjs", "layout.mjs"]) {
    copyFileSync(join(REAL, at(".claude/kitchen/scripts"), file), join(seed, scripts, file));
  }
  copyFileSync(join(REAL, at(".claude/kitchen/kitchen.schema.json")), join(seed, ".claude", "kitchen", "kitchen.schema.json"));
  chmodSync(join(seed, scripts, "shoot-pair.sh"), 0o755);
  copyFileSync(join(REAL, at(".claude/kitchen.json")), join(seed, ".claude", "kitchen.json"));
  write(join(seed, scripts, "drive.mjs"), DRIVE_STUB);
  write(
    join(seed, scripts, "session-up.sh"),
    '#!/bin/sh\necho "session-up $PWD $(ls .claude/session-up.d 2>/dev/null | tr \'\\n\' \' \')" >>"$STUB_LOG"\necho http://localhost\n',
    0o755,
  );
  write(join(seed, scripts, "dev-server.sh"), "#!/bin/sh\nexit 0\n", 0o755);
  write(join(seed, ".claude", "session-up.d", "10-store"), "#!/bin/sh\nexit 0\n", 0o755);
  write(join(seed, ".maestro", "flows", "a.yaml"), "name: a\n");
  write(join(seed, ".maestro", "flows", "b.yaml"), "name: b\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "base");
  git(seed, "push", "-q", "origin", "main");
  git(seed, "checkout", "-q", "-b", "feature");
  write(join(seed, "feature.txt"), "feature\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "feature");
  git(seed, "push", "-q", "origin", "feature");
  git(root, "clone", "-q", "--single-branch", "--branch", "feature", origin, work);
  git(work, "config", "user.name", "t");
  git(work, "config", "user.email", "t@example.com");
  const bin = join(root, "bin");
  write(join(bin, "pnpm"), "#!/bin/sh\nexit 0\n", 0o755);
  return { work, bin };
}

describe("shoot-pair.sh", () => {
  let root;
  let work;
  let bin;
  let log;
  let n = 0;

  function shoot(flows, env = {}) {
    const out = join(root, `out-${n++}`);
    const result = spawnSync(
      join(work, ".claude/kitchen/scripts/shoot-pair.sh"),
      [out, ...flows.map((f) => `.maestro/flows/${f}.yaml`)],
      {
        cwd: work,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          TMPDIR: root,
          STUB_LOG: log,
          ...env,
        },
      },
    );
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    return { ...result, lines, out };
  }

  function driven() {
    return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
  }

  before(() => {
    root = mkdtempSync(join(tmpdir(), "shoot-pair-"));
    ({ work, bin } = setup(root));
    log = join(root, "drive.log");
  });

  it("fetches origin/main when the clone has no such ref, then shoots both halves", () => {
    assert.equal(
      spawnSync("git", ["rev-parse", "--verify", "-q", "origin/main"], {
        cwd: work,
      }).status,
      1,
    );
    const result = shoot(["a"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.lines, ["a\tafter=ok\tbefore=ok"]);
    assert.deepEqual(readdirSync(result.out).sort(), ["a-after.png", "a-before.png"]);
    assert.equal(git(work, "rev-parse", "origin/main").length, 40);
  });

  it("takes the Before from the cache on a second lap of an unchanged flow", () => {
    const result = shoot(["a"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.lines, ["a\tafter=ok\tbefore=cached (ok)"]);
    assert.deepEqual(
      driven().filter((line) => line === "before a"),
      ["before a"],
    );
  });

  it("re-shoots the Before when the flow's content changed, and keeps no stale shot of it", () => {
    write(join(work, ".maestro/flows/a.yaml"), "name: a, edited\n");
    const result = shoot(["a"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.lines, ["a\tafter=ok\tbefore=ok"]);
    assert.equal(
      readFileSync(join(result.out, "a-before.png"), "utf8"),
      "before:name: a, edited\n",
    );
    assert.deepEqual(
      driven().filter((line) => line === "before a"),
      ["before a", "before a"],
    );
  });

  it("does not carry a cached failure frame into a Before that now passes", () => {
    const failed = shoot(["b"], { STUB_FAIL_BEFORE: "b" });
    assert.deepEqual(failed.lines, ["b\tafter=ok\tbefore=failed"]);
    assert.ok(existsSync(join(failed.out, "b-failure-before.png")));
    write(join(work, ".maestro/flows/b.yaml"), "name: b, fixed\n");
    const fixed = shoot(["b"]);
    assert.deepEqual(fixed.lines, ["b\tafter=ok\tbefore=ok"]);
    assert.deepEqual(readdirSync(fixed.out).sort(), ["b-after.png", "b-before.png"]);
  });

  it("exits 1 when an After failed, after printing every flow's line and keeping its failure shot", () => {
    const result = shoot(["a", "b"], { STUB_FAIL_AFTER: "b" });
    assert.equal(result.status, 1);
    assert.deepEqual(result.lines, [
      "a\tafter=ok\tbefore=cached (ok)",
      "b\tafter=failed\tbefore=cached (ok)",
    ]);
    assert.ok(existsSync(join(result.out, "b-failure-after.png")));
  });

  it("exits 0 when only a Before failed, since a Before the flow cannot reach is the not-built evidence", () => {
    write(join(work, ".maestro/flows/a.yaml"), "name: a, edited again\n");
    const result = shoot(["a"], { STUB_FAIL_BEFORE: "a" });
    assert.deepEqual(result.lines, ["a\tafter=ok\tbefore=failed"]);
    assert.equal(result.status, 0);
  });

  it("lays the branch's session-up.d over the base, which may predate the hooks", () => {
    write(join(work, ".claude/session-up.d/20-new"), "#!/bin/sh\nexit 0\n", 0o755);
    write(join(work, ".maestro/flows/c.yaml"), "name: c\n");
    const result = shoot(["c"]);
    assert.equal(result.status, 0, result.stderr);
    const baseUp = driven()
      .filter((line) => line.startsWith("session-up") && line.includes("shoot-pair-base"))
      .at(-1);
    assert.match(baseUp, /20-new/);
  });
});
