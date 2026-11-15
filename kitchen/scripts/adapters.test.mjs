import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FIXTURES } from "./adapter-fixtures.mjs";
import { sandbox, stubAdapter } from "./adapter-sandbox.mjs";
import { CONTRACT } from "./adapter.mjs";
import { load, SLOTS } from "./kitchen.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ADAPTER = fileURLToPath(new URL("./adapter.mjs", import.meta.url));
const ADAPTERS = join(ROOT, ".claude/kitchen/adapters");

const ERRORS_ACTIONS = ["top", "search"];
const SHIPPED = ["posthog", "none"];

const minimal = { repo: "acme/app", humans: { default: "owner" } };

function dispatch(args, adapters) {
  const env = { ...process.env };
  delete env.KITCHEN_CONFIG;
  if (adapters !== undefined) {
    const path = join(mkdtempSync(join(tmpdir(), "adapters-")), "kitchen.json");
    writeFileSync(path, JSON.stringify({ ...minimal, adapters }));
    env.KITCHEN_CONFIG = path;
  }
  const run = spawnSync("node", [ADAPTER, ...args], { encoding: "utf8", env });
  let json = null;
  try {
    json = JSON.parse(run.stdout);
  } catch {
    json = null;
  }
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, json };
}

const settings = load().adapters.errors;

const onDisk = () =>
  existsSync(join(ADAPTERS, "errors"))
    ? readdirSync(join(ADAPTERS, "errors"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

const using = (name) => ({ errors: name === "posthog" ? settings : { use: name } });

function assertMeetsContract(result, { adapter, action }) {
  assert.equal(result.status, 0, result.stderr);
  const { json } = result;
  assert.ok(json, `${adapter} ${action} printed no JSON: ${result.stdout}`);
  assert.equal(json.slot, "errors");
  assert.equal(json.adapter, adapter);
  assert.equal(json.action, action);
  assert.equal(typeof json.enabled, "boolean");
  if (json.enabled) {
    assert.ok(Number.isInteger(json.window.days) && json.window.days > 0);
    assert.equal(json.window.from, `-${json.window.days}d`);
    assert.equal(typeof json.pins, "object");
    assert.ok(existsSync(join(ROOT, json.guide)), `${json.guide} is not a file`);
  } else {
    assert.equal(typeof json.reason, "string");
    assert.ok(json.reason.length > 0 && !json.reason.includes("\n"));
  }
}

describe("the errors slot's contract", () => {
  for (const name of new Set([...SHIPPED, ...onDisk()])) {
    describe(name, () => {
      for (const action of ERRORS_ACTIONS) {
        it(`${action} is an executable`, () => {
          const file = join(ADAPTERS, "errors", name, action);
          assert.ok(existsSync(file), `${file} is missing`);
          assert.ok(statSync(file).mode & 0o111, `${file} is not executable`);
        });

        it(`${action} answers one JSON object the contract describes`, () => {
          assertMeetsContract(dispatch(["errors", action], using(name)), { adapter: name, action });
        });
      }
    });
  }
});

describe("the posthog adapter", () => {
  it("emits the pins kitchen.json carries, and none of its own", () => {
    const { json } = dispatch(["errors", "top"], using("posthog"));
    assert.deepEqual(json.pins, {
      organization: settings.organization,
      project: settings.project,
      projectName: settings.projectName,
      timezone: settings.timezone,
      decoyProject: settings.decoyProject,
    });
  });

  it("looks back 7 days for top and 30 for search unless told otherwise", () => {
    assert.equal(dispatch(["errors", "top"], using("posthog")).json.window.days, 7);
    assert.equal(dispatch(["errors", "search"], using("posthog")).json.window.days, 30);
  });

  it("takes a window in days", () => {
    const { json } = dispatch(["errors", "search", "--window", "14d"], using("posthog"));
    assert.deepEqual(json.window, { days: 14, from: "-14d" });
  });

  it("refuses a window that is not a number of days", () => {
    for (const bad of ["soon", "0d", "14", "9999d"])
      assert.equal(dispatch(["errors", "top", "--window", bad], using("posthog")).status, 2, bad);
  });

  it("keeps the decoy project optional", () => {
    const { decoyProject: _, ...without } = settings;
    const { json, status } = dispatch(["errors", "top"], { errors: without });
    assert.equal(status, 0);
    assert.equal(json.pins.decoyProject, null);
  });

  for (const key of ["organization", "project", "projectName", "timezone"]) {
    it(`refuses a config with no ${key}`, () => {
      const { [key]: _, ...without } = settings;
      const run = dispatch(["errors", "top"], { errors: without });
      assert.equal(run.status, 1);
      assert.match(run.stderr, new RegExp(`adapters\\.errors\\.${key}`));
    });
  }

  it("refuses a project that is not a number", () => {
    const run = dispatch(["errors", "top"], { errors: { ...settings, project: String(settings.project) } });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /adapters\.errors\.project/);
  });
});

describe("errors: none", () => {
  const off = [
    ["spelled as a string", { errors: "none" }],
    ["spelled as an object", { errors: { use: "none" } }],
    ["left out", {}],
  ];

  for (const [how, adapters] of off) {
    for (const action of ERRORS_ACTIONS) {
      it(`${action} says it is off, ${how}`, () => {
        const { json, status } = dispatch(["errors", action], adapters);
        assert.equal(status, 0);
        assert.equal(json.adapter, "none");
        assert.equal(json.enabled, false);
      });
    }
  }

  it("top says the Fix loop is off, in a line that can follow `none · `", () => {
    const { json } = dispatch(["errors", "top"], { errors: "none" });
    assert.match(json.reason, /Fix loop is off/);
    assert.equal(json.reason, json.reason.trim());
  });

  it("search says nothing was searched, never that nothing happened", () => {
    const { json } = dispatch(["errors", "search"], { errors: "none" });
    assert.match(json.reason, /nothing was searched/i);
  });
});

describe("the dispatcher", () => {
  it("refuses a slot it has no contract for", () => {
    assert.equal(dispatch(["lunch", "top"], {}).status, 2);
  });

  it("refuses an action outside the slot's contract", () => {
    assert.equal(dispatch(["errors", "resolve"], using("posthog")).status, 2);
  });

  it("names the adapter a config asks for that is not on disk", () => {
    const run = dispatch(["errors", "top"], { errors: "no-such-tracker" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /no-such-tracker/);
  });

  it("reads kitchen.json when no config is given", () => {
    const { json } = dispatch(["errors", "top"]);
    assert.equal(json.adapter, settings.use);
  });
});

const ACTIONS = {
  stack: ["up", "down"],
  db: ["prepare", "down", "migrate", "pending", "apply"],
  auth: ["seed", "sign-in"],
  errors: ERRORS_ACTIONS,
  evidenceHost: ["push"],
};

describe("the dispatcher's contract", () => {
  it("has an entry for every slot the kitchen fills, and no other", () => {
    assert.deepEqual(Object.keys(CONTRACT).sort(), [...SLOTS].sort());
  });

  for (const [slot, actions] of Object.entries(ACTIONS)) {
    it(`${slot} has the actions ${actions.join(", ")}`, () => {
      assert.deepEqual(CONTRACT[slot], actions);
    });
  }
});

describe("the backend slots' adapters", () => {
  const present = (slot) =>
    existsSync(join(ADAPTERS, slot))
      ? readdirSync(join(ADAPTERS, slot), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
      : [];

  for (const slot of ["stack", "db", "auth", "evidenceHost"]) {
    describe(slot, () => {
      it("is filled in kitchen.json by an adapter that is on disk", () => {
        assert.ok(present(slot).includes(load().adapters[slot].use));
      });

      it("has a README that names every action", () => {
        const readme = join(ADAPTERS, slot, "README.md");
        assert.ok(existsSync(readme), `${readme} is missing`);
        const text = readFileSync(readme, "utf8");
        for (const action of ACTIONS[slot]) assert.ok(text.includes(`\`${action}\``), `${action} is not in the README`);
      });

      for (const name of present(slot)) {
        for (const action of ACTIONS[slot]) {
          it(`${name} ${action} is an executable`, () => {
            const file = join(ADAPTERS, slot, name, action);
            assert.ok(existsSync(file), `${file} is missing`);
            assert.ok(statSync(file).mode & 0o111, `${file} is not executable`);
          });
        }
      }

      it("names the adapter a config asks for that is not on disk", () => {
        const run = dispatch([slot, ACTIONS[slot][0]], { [slot]: "no-such-adapter" });
        assert.equal(run.status, 1);
        assert.match(run.stderr, /no-such-adapter/);
      });

      it("refuses an action outside its contract", () => {
        assert.equal(dispatch([slot, "frobnicate"], {}).status, 2);
      });
    });
  }
});

describe("what the dispatcher hands an adapter", () => {
  it("carries the slot, its settings, the package manager and the repo root", () => {
    const sandboxed = sandbox({ adapters: { stack: { use: "probe", answer: 42 } } });
    stubAdapter(sandboxed, "stack", "probe", {
      up: 'printf "%s" "$KITCHEN_ADAPTER"',
      down: "exit 0",
    });
    const run = sandboxed.dispatch(["stack", "up"]);
    assert.equal(run.status, 0, run.stderr);
    const given = JSON.parse(run.stdout);
    assert.equal(given.slot, "stack");
    assert.deepEqual(given.settings, { use: "probe", answer: 42 });
    assert.equal(given.packageManager, load().packageManager);
    assert.equal(realpathSync(given.root), realpathSync(sandboxed.root));
  });

  it("passes the adapter's exit code on", () => {
    const sandboxed = sandbox({ adapters: { stack: "probe" } });
    stubAdapter(sandboxed, "stack", "probe", { up: "exit 7", down: "exit 0" });
    assert.equal(sandboxed.dispatch(["stack", "up"]).status, 7);
  });

  it("lets an adapter's stdout through untouched, for a script that captures it", () => {
    const sandboxed = sandbox({ adapters: { stack: "probe" } });
    stubAdapter(sandboxed, "stack", "probe", { up: "echo API_URL=http://localhost:1", down: "exit 0" });
    assert.equal(sandboxed.dispatch(["stack", "up"]).stdout, "API_URL=http://localhost:1\n");
  });
});

describe("an adapter the dispatcher cannot start", () => {
  it("says so on stderr, naming slot, adapter and action and the system's reason, and exits 1", () => {
    const sandboxed = sandbox({ adapters: { stack: "probe" } });
    sandboxed.write(".claude/kitchen/adapters/stack/probe/up", "#!/bin/sh\necho started\n");
    sandboxed.write(".claude/kitchen/adapters/stack/probe/down", "#!/bin/sh\nexit 0\n", 0o755);
    const run = sandboxed.dispatch(["stack", "up"]);
    assert.equal(run.status, 1);
    assert.equal(run.stdout, "");
    assert.match(run.stderr, /^adapter stack\/probe\/up: .*EACCES/m);
  });

  it("says so when the interpreter its first line names is not there", () => {
    const sandboxed = sandbox({ adapters: { stack: "probe" } });
    sandboxed.write(".claude/kitchen/adapters/stack/probe/up", "#!/no/such/interpreter\n", 0o755);
    const run = sandboxed.dispatch(["stack", "up"]);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /^adapter stack\/probe\/up: .*ENOENT/m);
  });

  it("does not add a line of its own when the adapter started and failed", () => {
    const sandboxed = sandbox({ adapters: { stack: "probe" } });
    stubAdapter(sandboxed, "stack", "probe", { up: "exit 7", down: "exit 0" });
    const run = sandboxed.dispatch(["stack", "up"]);
    assert.equal(run.status, 7);
    assert.equal(run.stderr, "");
  });
});

const ASSIGNMENT = /^[A-Z][A-Z0-9_]*=.+$/;

const directories = (slot) =>
  readdirSync(join(ADAPTERS, slot), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const lines = (text) => text.split("\n").filter(Boolean);

async function within(slot, name, body) {
  const make = FIXTURES[slot]?.[name];
  assert.ok(make, `adapters/${slot}/${name} has no fixture in adapter-fixtures.mjs, so it has no contract test`);
  const fixture = await make();
  try {
    await body(fixture);
  } finally {
    fixture.sandboxed.dispatch([slot, "down"], { env: fixture.env });
    await fixture.close();
  }
}

describe("every adapter on disk passes its slot's contract", () => {
  const SHIPPED_ADAPTERS = {
    stack: ["none", "supabase-local", "trpc-next"],
    db: ["none", "postgres-drizzle", "supabase-migrations"],
    auth: ["better-auth", "none", "supabase-auth"],
    evidenceHost: ["git-branch"],
  };

  for (const [slot, names] of Object.entries(SHIPPED_ADAPTERS)) {
    it(`${slot} ships ${names.join(", ")}`, () => {
      assert.deepEqual(directories(slot).sort(), names);
    });
  }

  describe("stack", () => {
    for (const name of directories("stack")) {
      it(`${name}: up prints only NAME=value lines, at most one API_URL, and is idempotent; down is quiet and repeatable`, async () => {
        await within("stack", name, async ({ sandboxed, env }) => {
          const before = sandboxed.dispatch(["stack", "down"], { env });
          assert.equal(before.status, 0, before.stderr);
          assert.equal(before.stdout, "");
          const first = await sandboxed.dispatchAsync(["stack", "up"], { env });
          assert.equal(first.status, 0, first.stderr);
          for (const line of lines(first.stdout)) assert.match(line, ASSIGNMENT);
          const urls = lines(first.stdout).filter((line) => line.startsWith("API_URL="));
          assert.ok(urls.length <= 1);
          for (const url of urls) assert.match(url, /^API_URL=https?:\/\/\S+$/);
          const second = await sandboxed.dispatchAsync(["stack", "up"], { env });
          assert.equal(second.stdout, first.stdout);
          for (let lap = 0; lap < 2; lap++) {
            const down = sandboxed.dispatch(["stack", "down"], { env });
            assert.equal(down.status, 0, down.stderr);
            assert.equal(down.stdout, "");
          }
        });
      });
    }
  });

  describe("db", () => {
    for (const name of directories("db")) {
      it(`${name}: prepare prints only NAME=value lines; down is quiet and repeatable; pending and apply exit 0`, async () => {
        await within("db", name, async ({ sandboxed, env, tag }) => {
          const prepare = sandboxed.dispatch(["db", "prepare"], { env });
          assert.equal(prepare.status, 0, prepare.stderr);
          for (const line of lines(prepare.stdout)) assert.match(line, ASSIGNMENT);
          assert.equal(sandboxed.dispatch(["db", "pending"], { env }).status, 0);
          assert.equal(sandboxed.dispatch(["db", "apply", tag ?? "0000_none"], { env }).status, 0);
          for (let lap = 0; lap < 2; lap++) {
            const down = sandboxed.dispatch(["db", "down"], { env });
            assert.equal(down.status, 0, down.stderr);
            assert.equal(down.stdout, "");
          }
        });
      });

      it(`${name}: migrate prints the tags it wrote, one a line, and holds an expand to pass and a contract to fail`, async () => {
        await within("db", name, async ({ sandboxed, env, inert, migrationWith, expandSql }) => {
          if (inert) {
            const run = sandboxed.dispatch(["db", "migrate", "--name", "x"], { env });
            assert.equal(run.status, 0, run.stderr);
            assert.equal(run.stdout, "");
            return;
          }
          const change = migrationWith(expandSql);
          const ok = sandboxed.dispatch(["db", "migrate", ...change.args], { env: { ...env, ...change.env } });
          assert.equal(ok.status, 0, ok.stderr);
          for (const line of lines(ok.stdout)) assert.match(line, /^[0-9A-Za-z_]+$/);
          assert.equal(lines(ok.stdout).length, 1);
        });
        await within("db", name, async ({ sandboxed, env, inert, migrationWith, contractSql }) => {
          if (inert) return;
          const change = migrationWith(contractSql);
          const refused = sandboxed.dispatch(["db", "migrate", ...change.args], { env: { ...env, ...change.env } });
          assert.equal(refused.status, 1);
          assert.equal(refused.stdout, "");
          assert.match(refused.stderr, /contract/i);
        });
      });

      it(`${name}: migrate without a name is a usage error, unless it has nothing to migrate`, async () => {
        await within("db", name, async ({ sandboxed, env, inert }) => {
          const run = sandboxed.dispatch(["db", "migrate"], { env });
          assert.equal(run.status, inert ? 0 : 2, run.stderr);
        });
      });
    }
  });

  describe("auth", () => {
    for (const name of directories("auth")) {
      it(`${name}: seed prints only NAME=value lines, and sign-in writes a Playwright storageState to the path it prints`, async () => {
        await within("auth", name, async ({ sandboxed, env, apiUrl, appUrl, inert }) => {
          const seed = await sandboxed.dispatchAsync(["auth", "seed"], { env });
          assert.equal(seed.status, 0, seed.stderr);
          for (const line of lines(seed.stdout)) assert.match(line, ASSIGNMENT);

          const out = join(mkdtempSync(join(tmpdir(), "contract-auth-")), "state.json");
          const seeded = sandboxed.path(".claude/tmp/dev-user.json");
          const email = existsSync(seeded) ? JSON.parse(readFileSync(seeded, "utf8")).email : "dev@fixture.test";
          const flags = ["--email", email, "--api-url", apiUrl ?? "http://localhost:1", "--app-url", appUrl ?? "http://localhost:8081", "--out", out];
          const run = await sandboxed.dispatchAsync(["auth", "sign-in", ...flags], { env });
          assert.equal(run.status, 0, run.stderr);
          assert.equal(run.stdout.trim(), out);
          const state = JSON.parse(readFileSync(out, "utf8"));
          assert.ok(Array.isArray(state.cookies) && Array.isArray(state.origins));
          for (const cookie of state.cookies) for (const key of ["name", "value", "domain", "path"]) assert.ok(key in cookie, key);
          for (const origin of state.origins) assert.ok(typeof origin.origin === "string" && Array.isArray(origin.localStorage));
          const carried = state.cookies.length + state.origins.flatMap((origin) => origin.localStorage).length;
          assert.equal(carried > 0, !inert);
        });
      });

      it(`${name}: sign-in with no --out writes .claude/tmp/auth.json and prints that path`, async () => {
        await within("auth", name, async ({ sandboxed, env, apiUrl, appUrl }) => {
          await sandboxed.dispatchAsync(["auth", "seed"], { env });
          const flags = ["--api-url", apiUrl ?? "http://localhost:1", "--app-url", appUrl ?? "http://localhost:8081"];
          const run = await sandboxed.dispatchAsync(["auth", "sign-in", ...flags], { env });
          assert.equal(run.status, 0, run.stderr);
          const out = sandboxed.path(".claude/tmp/auth.json");
          assert.equal(run.stdout.trim(), out);
          assert.ok(existsSync(out));
        });
      });
    }
  });

  describe("evidenceHost", () => {
    for (const name of directories("evidenceHost")) {
      it(`${name}: push prints one <name>.png<TAB><url> line per PNG, and refuses to run without a PR and a folder`, async () => {
        await within("evidenceHost", name, async ({ sandboxed, env, shots }) => {
          const run = sandboxed.dispatch(["evidenceHost", "push", "41", shots], { env, cwd: sandboxed.root });
          assert.equal(run.status, 0, run.stderr);
          const rows = lines(run.stdout).map((line) => line.split("\t"));
          assert.deepEqual(rows.map(([file]) => file), ["home-after.png", "home-before.png"]);
          for (const [, url] of rows) assert.match(url, /^https:\/\/\S+$/);
          assert.notEqual(sandboxed.dispatch(["evidenceHost", "push"], { env, cwd: sandboxed.root }).status, 0);
        });
      });
    }
  });
});
