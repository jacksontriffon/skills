import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { sandbox } from "./adapter-sandbox.mjs";

const ADAPTERS = fileURLToPath(new URL("../adapters/", import.meta.url));
const readme = (slot) => readFileSync(join(ADAPTERS, slot, "README.md"), "utf8");

const allNone = () => sandbox({ isolated: true, adapters: { stack: "none", db: "none", auth: "none" } });

describe("stack: none", () => {
  it("up and down print nothing, which is a stack with no API_URL", () => {
    const sandboxed = allNone();
    for (const action of ["up", "down"]) {
      const run = sandboxed.dispatch(["stack", action]);
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout, "");
    }
  });

  it("records no API URL, so the drive falls back to its own default and not to a stale one", () => {
    const sandboxed = allNone();
    sandboxed.dispatch(["stack", "up"]);
    assert.equal(existsSync(sandboxed.path(".claude/tmp/dev-server.api.url")), false);
  });

  it("starts nothing: it runs on a path with no package manager and no CLI", () => {
    assert.equal(allNone().dispatch(["stack", "up"]).status, 0);
  });

  it("is documented as printing no API_URL, and as meaning an app with no API", () => {
    assert.match(readme("stack"), /## none/);
    assert.match(readme("stack"), /no `API_URL`/);
  });
});

describe("db: none", () => {
  const ACTIONS = [["prepare"], ["down"], ["pending"], ["apply", "0000_anything"], ["apply", "0000_anything", "--record-only"], ["migrate", "--name", "x"]];

  for (const action of ACTIONS) {
    it(`${action.join(" ")} exits 0 and prints nothing on stdout`, () => {
      const run = allNone().dispatch(["db", ...action]);
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout, "");
    });
  }

  it("migrate says on stderr that there is nothing to migrate, so an agent reads why no tag came back", () => {
    const run = allNone().dispatch(["db", "migrate", "--name", "x"]);
    assert.match(run.stderr, /nothing to migrate/i);
    assert.match(run.stderr, /adapters\.db/);
  });

  it("migrate is fine with no --name, since a project with no database has no names to give", () => {
    assert.equal(allNone().dispatch(["db", "migrate"]).status, 0);
  });

  it("is documented, migrate's stderr line included", () => {
    assert.match(readme("db"), /## none/);
    assert.match(readme("db"), /nothing to migrate/i);
  });
});

describe("auth: none", () => {
  it("seed prints nothing and writes no account", () => {
    const sandboxed = allNone();
    const run = sandboxed.dispatch(["auth", "seed"]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "");
    assert.equal(existsSync(sandboxed.path(".claude/tmp/dev-user.json")), false);
  });

  it("sign-in writes an empty but valid Playwright storageState to .claude/tmp/auth.json and prints its path", () => {
    const sandboxed = allNone();
    const run = sandboxed.dispatch(["auth", "sign-in"]);
    assert.equal(run.status, 0, run.stderr);
    const out = sandboxed.path(".claude/tmp/auth.json");
    assert.equal(run.stdout.trim(), out);
    assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), { cookies: [], origins: [] });
  });

  it("sign-in takes every argument the drive and the other adapters take, and writes where --out says", () => {
    const sandboxed = allNone();
    const out = sandboxed.path("elsewhere/second.json");
    const run = sandboxed.dispatch(["auth", "sign-in", "--email", "dev+2@example.test", "--api-url", "http://localhost:1", "--app-url", "http://localhost:2", "--out", out]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), out);
    assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), { cookies: [], origins: [] });
    assert.equal(existsSync(sandboxed.path(".claude/tmp/auth.json")), false);
  });

  it("is documented, the empty state included", () => {
    assert.match(readme("auth"), /## none/);
    assert.match(readme("auth"), /"cookies": \[\]/);
  });
});

describe("a project with every slot none", () => {
  it("resolves, with each slot's adapter named none", () => {
    const sandboxed = sandbox({ adapters: { stack: "none", db: "none", auth: "none", errors: "none" } });
    for (const slot of ["stack", "db", "auth", "errors"]) {
      assert.equal(sandboxed.config.adapters[slot], "none");
    }
    assert.equal(sandboxed.run("node", [sandboxed.path(".claude/kitchen/scripts/kitchen.mjs"), "get", "adapters.stack.use"]).stdout.trim(), "none");
  });
});
