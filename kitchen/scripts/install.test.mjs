import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

function project(packageManager, lockfile) {
  const root = mkdtempSync(join(tmpdir(), "install-"));
  const scripts = join(root, ".claude/kitchen/scripts");
  mkdirSync(scripts, { recursive: true });
  for (const file of ["install.sh", "kitchen.mjs", "layout.mjs"])
    cpSync(new URL(`./${file}`, import.meta.url), join(scripts, file));
  cpSync(new URL("../kitchen.schema.json", import.meta.url), join(root, ".claude/kitchen/kitchen.schema.json"));
  writeFileSync(join(root, ".claude/kitchen.json"), JSON.stringify({ repo: "a/b", humans: { default: "a" }, packageManager }));
  if (lockfile) writeFileSync(join(root, lockfile), "");
  execFileSync("git", ["init", "-q", root]);
  return execFileSync(join(scripts, "install.sh"), {
    encoding: "utf8",
    env: { ...process.env, KITCHEN_INSTALL_DRY: "1", KITCHEN_YARN_VERSION: "4.5.0", PATH: `/nonexistent:${process.env.PATH}` },
  })
    .trim()
    .split("\n")
    .filter((line) => !line.startsWith("corepack") && !line.startsWith("npm install --global"));
}

describe("install.sh", () => {
  it("installs through the package manager kitchen.json names, held to its lockfile", () => {
    assert.deepEqual(project("pnpm", "pnpm-lock.yaml"), ["pnpm install --frozen-lockfile"]);
    assert.deepEqual(project("npm", "package-lock.json"), ["npm ci"]);
    assert.deepEqual(project("yarn", "yarn.lock"), ["yarn install --immutable"]);
    assert.deepEqual(project("bun", "bun.lock"), ["bun install --frozen-lockfile"]);
  });

  it("writes the lockfile when the project has none", () => {
    assert.deepEqual(project("pnpm"), ["pnpm install"]);
    assert.deepEqual(project("npm"), ["npm install"]);
  });
});
