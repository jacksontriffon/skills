import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { readFileSync } from "node:fs";

import {
  brief,
  DEFAULTS,
  get,
  load,
  repoVariables,
  resolve,
  SCHEMA,
  trusted,
  validate,
  workflowEnv,
} from "./kitchen.mjs";

const SCRIPT = fileURLToPath(new URL("./kitchen.mjs", import.meta.url));

const minimal = { repo: "acme/app", humans: { default: "owner" } };

describe("resolve", () => {
  it("fills every default a minimal file leaves out", () => {
    const config = resolve(minimal);
    assert.equal(config.baseBranch, "main");
    assert.equal(config.packageManager, "pnpm");
    assert.deepEqual(config.labels, DEFAULTS.labels);
    assert.deepEqual(config.expo.viewport, { width: 390, height: 844 });
    assert.deepEqual(config.risk, { high: [], medium: [], largeDiffLines: 400 });
    assert.equal(config.ci.runner, "ubuntu-latest");
  });

  it("names the product after the repo unless told otherwise", () => {
    assert.equal(resolve(minimal).product, "app");
    assert.equal(resolve({ ...minimal, product: "Acme" }).product, "Acme");
  });

  it("defaults the backend to Supabase and error tracking to none", () => {
    assert.deepEqual(resolve(minimal).adapters, {
      stack: { use: "supabase-local" },
      db: { use: "supabase-migrations" },
      auth: { use: "supabase-auth" },
      errors: { use: "none" },
      evidenceHost: { use: "git-branch" },
    });
  });

  it("keeps an adapter's own settings beside its name", () => {
    const config = resolve({ ...minimal, adapters: { errors: { use: "some-tracker", project: 1 } } });
    assert.deepEqual(config.adapters.errors, { use: "some-tracker", project: 1 });
    assert.deepEqual(config.adapters.stack, { use: "supabase-local" });
  });

  it("keeps the evidence host's embed prefixes", () => {
    const embedPrefixes = ["https://shots.example.org/bucket/"];
    const config = resolve({
      ...minimal,
      adapters: { evidenceHost: { use: "git-branch", embedPrefixes } },
    });
    assert.deepEqual(config.adapters.evidenceHost, { use: "git-branch", embedPrefixes });
  });

  it("overrides one key of a section and keeps the rest", () => {
    const config = resolve({ ...minimal, expo: { appDir: "apps/mobile" }, labels: { blocked: "stuck" } });
    assert.equal(config.expo.appDir, "apps/mobile");
    assert.equal(config.expo.webPort, 8081);
    assert.equal(config.labels.blocked, "stuck");
    assert.equal(config.labels.needsHuman, "needs-human");
  });

  it("refuses a key the kitchen does not read, at any depth", () => {
    assert.throws(() => resolve({ ...minimal, repoo: "x" }), /repoo is not a key/);
    assert.throws(() => resolve({ ...minimal, expo: { appdir: "x" } }), /expo\.appdir is not a key/);
    assert.throws(() => resolve({ ...minimal, humans: { default: "a", owners: {} } }), /humans\.owners/);
    assert.throws(
      () => resolve({ ...minimal, agents: { implementer: { modle: "opus" } } }),
      /agents\.implementer\.modle/,
    );
  });

  it("refuses a value of the wrong type", () => {
    assert.throws(() => resolve({ ...minimal, expo: { webPort: "8081" } }), /expo\.webPort must be number/);
    assert.throws(() => resolve({ ...minimal, risk: { high: "auth/**" } }), /risk\.high must be array/);
    assert.throws(() => resolve({ ...minimal, risk: { medium: [1] } }), /risk\.medium\[0\] must be string/);
    assert.throws(() => resolve({ ...minimal, risk: { largeDiffLines: "400" } }), /risk\.largeDiffLines must be number/);
    assert.throws(() => resolve({ ...minimal, adapters: { db: { project: 1 } } }), /adapters\.db\.use/);
    assert.throws(() => resolve({ ...minimal, adapters: { cache: "redis" } }), /adapters\.cache is not a slot/);
  });

  it("refuses a risk glob that can never match a path", () => {
    for (const glob of ["tooling/", "./tooling/**", "packages/{auth,db}/**", "src/?.ts", "src/[ab].ts", "a\\b"])
      assert.throws(
        () => resolve({ ...minimal, risk: { medium: [glob] } }),
        /risk\.medium\[0\] is a glob that matches nothing/,
        glob,
      );
    assert.doesNotThrow(() => resolve({ ...minimal, risk: { high: ["tooling/**", "src/*.ts", "pnpm-lock.yaml"] } }));
  });

  it("needs a repo as owner/name and an owner for every area", () => {
    assert.throws(() => resolve({ humans: { default: "a" } }), /repo must be string/);
    assert.throws(() => resolve({ ...minimal, repo: "app" }), /owner\/name/);
    assert.throws(() => resolve({ repo: "acme/app" }), /humans must be object/);
    assert.throws(() => resolve({ repo: "acme/app", humans: {} }), /humans\.default/);
  });

  it("knows only the package managers it can run commands through", () => {
    assert.equal(resolve({ ...minimal, packageManager: "bun" }).packageManager, "bun");
    assert.throws(() => resolve({ ...minimal, packageManager: "pip" }), /packageManager/);
  });

  it("leaves the defaults untouched for the next file", () => {
    resolve({ ...minimal, risk: { high: ["auth/**"] } }).risk.medium.push("x");
    assert.deepEqual(DEFAULTS.risk, { high: [], medium: [], largeDiffLines: 400 });
  });
});

describe("trusted", () => {
  it("is every handle humans names, once", () => {
    const config = resolve({ ...minimal, humans: { default: "a", areas: { billing: "b", design: "a" } } });
    assert.deepEqual(trusted(config), ["a", "b"]);
  });
});

describe("brief", () => {
  const text = brief(
    resolve({
      ...minimal,
      humans: { default: "a", areas: { billing: "b" } },
      adapters: { errors: { use: "some-tracker", project: 7 } },
    }),
  );

  it("prints every resolved key as kitchen.<path>, defaults included", () => {
    assert.match(text, /^kitchen\.repo = acme\/app$/m);
    assert.match(text, /^kitchen\.baseBranch = main$/m);
    assert.match(text, /^kitchen\.labels\.blocked = blocked$/m);
    assert.match(text, /^kitchen\.humans\.areas\.billing = b$/m);
    assert.match(text, /^kitchen\.ci\.runner = ubuntu-latest$/m);
  });

  it("prints an adapter's own settings, not only its name", () => {
    assert.match(text, /^kitchen\.adapters\.errors\.use = some-tracker$/m);
    assert.match(text, /^kitchen\.adapters\.errors\.project = 7$/m);
  });

  it("prints lists and empty values as JSON", () => {
    assert.match(text, /^kitchen\.expo\.nativeDirs = \["ios","android"\]$/m);
    assert.match(text, /^kitchen\.expo\.appId = null$/m);
  });
});

describe("get", () => {
  const config = resolve({ ...minimal, expo: { appDir: "apps/mobile" } });

  it("reads a dotted path, defaults included", () => {
    assert.equal(get(config, "expo.appDir"), "apps/mobile");
    assert.equal(get(config, "expo.viewport.width"), 390);
    assert.equal(get(config, "baseBranch"), "main");
  });

  it("refuses a key the kitchen does not read", () => {
    assert.throws(() => get(config, "expo.nowhere"), /expo\.nowhere is not a key the kitchen reads/);
    assert.throws(() => get(config, "baseBranch.length"), /baseBranch\.length/);
  });

  it("prints a string bare and anything else as JSON on the command line", () => {
    const value = (path) => execFileSync("node", [SCRIPT, "get", path], { encoding: "utf8" });
    assert.equal(value("baseBranch"), `${load().baseBranch}\n`);
    assert.equal(value("expo.nativeDirs"), `${JSON.stringify(load().expo.nativeDirs)}\n`);
  });
});

describe("what the workflows read", () => {
  const config = resolve({
    ...minimal,
    baseBranch: "trunk",
    flows: "e2e",
    expo: { appDir: "apps/mobile", scheme: "acme" },
    ci: { runner: "big-ubuntu", macRunner: "big-mac" },
  });

  const lines = (map) =>
    Object.entries(map)
      .map(([key, value]) => `${key}=${value}\n`)
      .join("");

  it("names the two runner labels a repo sets as variables", () => {
    assert.deepEqual(repoVariables(config), {
      KITCHEN_RUNNER: "big-ubuntu",
      KITCHEN_MAC_RUNNER: "big-mac",
    });
  });

  it("names what a job exports before its first project-specific step", () => {
    assert.deepEqual(workflowEnv(config), {
      KITCHEN_APP_DIR: "apps/mobile",
      KITCHEN_SCHEME: "acme",
      KITCHEN_FLOWS: "e2e",
      KITCHEN_BASE_BRANCH: "trunk",
      KITCHEN_PM: "pnpm",
      KITCHEN_DESIGN: "docs/design",
      KITCHEN_API_URL_ENV: "EXPO_PUBLIC_API_URL",
      KITCHEN_ENV_FILE: ".env",
      KITCHEN_PREVIEW_API: "",
      KITCHEN_LABEL_NATIVE_CHANGE: "native-change",
    });
  });

  it("exports an empty scheme rather than the word null", () => {
    assert.equal(workflowEnv(resolve(minimal)).KITCHEN_SCHEME, "");
  });

  it("prints KEY=value lines on the command line", () => {
    const run = (command) => execFileSync("node", [SCRIPT, command], { encoding: "utf8" });
    assert.equal(run("variables"), lines(repoVariables(load())));
    assert.equal(run("env"), lines(workflowEnv(load())));
  });
});

describe("this repo's kitchen.json", () => {
  it("resolves", () => assert.equal(load().humans.default.length > 0, true));
});

describe("kitchen.schema.json", () => {
  const leavesOf = (schema, prefix = "") =>
    Object.entries(schema.properties ?? {}).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return child.properties ? leavesOf(child, path) : [[path, child]];
    });

  it("is where the kitchen.json a project writes points its $schema", () => {
    assert.equal(SCHEMA.title, "kitchen.json");
    assert.deepEqual(resolve({ ...minimal, $schema: "./kitchen/kitchen.schema.json" }).repo, "acme/app");
  });

  it("is the one source of the defaults", () => {
    assert.equal(DEFAULTS.adapters.stack, SCHEMA.properties.adapters.properties.stack.default);
    assert.equal(DEFAULTS.ci.runner, SCHEMA.properties.ci.properties.runner.default);
    assert.deepEqual(DEFAULTS.labels.blocked, "blocked");
  });

  it("defaults the backend to the Supabase adapters, error tracking off, and evidence on a branch", () => {
    assert.deepEqual(DEFAULTS.adapters, {
      stack: "supabase-local",
      db: "supabase-migrations",
      auth: "supabase-auth",
      errors: "none",
      evidenceHost: "git-branch",
    });
  });

  it("types every key, and refuses one it does not list", () => {
    for (const [path, child] of leavesOf(SCHEMA))
      assert.ok(child.type || child.$ref || child.enum, `${path} has no type`);
    assert.equal(SCHEMA.additionalProperties, false);
  });

  it("needs only the repo and a default human, so a fresh file stays two keys long", () => {
    assert.deepEqual(SCHEMA.required, ["repo", "humans"]);
    assert.doesNotThrow(() => resolve(minimal));
  });

  it("takes every key the kitchen's sample project sets", () => {
    const sample = JSON.parse(readFileSync(new URL("./fixtures/kitchen.json", import.meta.url), "utf8"));
    assert.doesNotThrow(() => validate(sample));
    for (const key of Object.keys(sample)) assert.ok(key in SCHEMA.properties, key);
  });

  it("refuses a CI secret name a shell cannot export", () => {
    assert.throws(() => resolve({ ...minimal, ci: { secrets: ["db-url"] } }), /ci\.secrets\[0\] must match/);
  });

  it("refuses an adapter that is neither a name nor an object", () => {
    assert.throws(() => resolve({ ...minimal, adapters: { db: 7 } }), /adapters\.db must be string or object, not number/);
  });
});

describe("validate", () => {
  it("checks a value against any schema, not only the kitchen's", () => {
    const schema = { type: "object", required: ["a"], additionalProperties: false, properties: { a: { type: "number" } } };
    assert.doesNotThrow(() => validate({ a: 1 }, schema));
    assert.throws(() => validate({}, schema), /a must be number, not undefined/);
    assert.throws(() => validate({ a: 1, b: 2 }, schema), /b is not a key the kitchen reads/);
    assert.throws(() => validate([], schema), /the file must be object, not array/);
  });
});
