import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { denylist } from "./kitchen.mjs";

const ROOT = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

const DENYLIST = denylist();

const LINUX = "${{ vars.KITCHEN_RUNNER || 'ubuntu-latest' }}";
const MAC = "${{ vars.KITCHEN_MAC_RUNNER || 'macos-15' }}";

const WORKFLOWS = ["pr-preview.yml", "shoot-expo-web.yml", "verify-expo.yml"];

const jobBlock = (text, job) => {
  const start = text.indexOf(`\n  ${job}:\n`);
  assert.notEqual(start, -1, `no job named ${job}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
};

const runners = (text) =>
  [...text.matchAll(/^\s*runs-on:\s*(.+?)\s*$/gm)].map((match) => match[1]);

const workflow = (file) => read(`.github/workflows/${file}`);

const SHARED = [
  ...WORKFLOWS.map((file) => ({ file, text: workflow(file) })),
  { file: "ci.yml test job", text: jobBlock(workflow("ci.yml"), "test") },
];

describe("a shared workflow names no project", () => {
  for (const { file, text } of SHARED) {
    it(`${file} carries nothing from kitchen-denylist.txt`, () => {
      const lower = text.toLowerCase();
      assert.deepEqual(
        DENYLIST.filter((literal) => lower.includes(literal)),
        [],
      );
    });
  }
});

describe("a shared workflow takes its runner from a repository variable", () => {
  for (const { file, text } of SHARED) {
    it(`${file} hard-codes no runner label`, () => {
      const found = runners(text);
      assert.notEqual(found.length, 0);
      assert.deepEqual(
        found.filter((runner) => runner !== LINUX && runner !== MAC),
        [],
      );
    });
  }

  for (const file of ["ci.yml", "shoot-design.yml"]) {
    it(`every job in ${file} hard-codes no runner label`, () => {
      const found = runners(workflow(file));
      assert.notEqual(found.length, 0);
      assert.deepEqual(
        found.filter((runner) => runner !== LINUX),
        [],
      );
    });
  }

  for (const file of [...WORKFLOWS, "ci.yml", "shoot-design.yml"]) {
    it(`${file} uses no action from a denylisted vendor`, () => {
      const used = workflow(file)
        .split("\n")
        .filter((line) => /^\s*(- )?uses:/.test(line))
        .join("\n")
        .toLowerCase();
      assert.deepEqual(
        DENYLIST.filter((literal) => used.includes(literal)),
        [],
      );
    });
  }

  it("verify-expo.yml puts only its macOS job on the macOS runner", () => {
    const text = workflow("verify-expo.yml");
    assert.deepEqual(runners(jobBlock(text, "flows")), [LINUX]);
    assert.deepEqual(runners(jobBlock(text, "ios")), [MAC]);
  });
});

describe("the dictionary stays out of the shared workflows", () => {
  for (const file of WORKFLOWS) {
    it(`${file} starts no database of its own`, () => {
      const text = workflow(file);
      assert.deepEqual(
        [/fixture-dictionary/, /docker run/].filter((pattern) => pattern.test(text)),
        [],
      );
    });
  }
});

describe("shoot-expo-web.yml's push step", () => {
  const push = () => {
    const text = workflow("shoot-expo-web.yml");
    const start = text.indexOf("- name: Push the shots to evidence/<pr>");
    assert.notEqual(start, -1, "no push step");
    const next = text.indexOf("\n      - name:", start + 1);
    return next === -1 ? text.slice(start) : text.slice(start, next);
  };

  it("refuses a run that took no screenshot at all", () => {
    assert.match(push(), /\$\{#shots\[@\]\}" -eq 0/);
  });

  it("hosts a run whose every shot is a failure shot, since that is a Before for a feature not built yet", () => {
    assert.doesNotMatch(push(), /-failure\.png/);
  });
});

describe("shoot-expo-web.yml's stack steps", () => {
  const text = () => workflow("shoot-expo-web.yml");

  it("starts and stops the servers with the core dev-server.sh", () => {
    assert.match(text(), /\.claude\/kitchen\/scripts\/dev-server\.sh start/);
    assert.match(text(), /\.claude\/kitchen\/scripts\/dev-server\.sh stop/);
  });

  it("signs in through the auth adapter, as the account it seeded", () => {
    assert.match(text(), /AUTH_DEV_LOGIN_EMAIL="\$email" node \.claude\/kitchen\/scripts\/adapter\.mjs auth sign-in/);
  });

  it("pushes the shots through the evidence host's push-shots.sh", () => {
    assert.match(text(), /\.claude\/kitchen\/scripts\/push-shots\.sh/);
  });
});
