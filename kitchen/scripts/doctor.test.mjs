import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import {
  checkAdapters,
  checkConfig,
  checkDenylist,
  checkGitHub,
  checkSessionUp,
  checkWorkflows,
  format,
  LABELS,
  labelRows,
  ROW,
  WORKFLOWS,
} from "./doctor.mjs";
import { DEFAULTS, resolve } from "./kitchen.mjs";
import { at, ROOT } from "./layout.mjs";

const minimal = { repo: "acme/app", humans: { default: "owner" } };
const dir = () => mkdtempSync(join(tmpdir(), "doctor-"));
const file = (text) => {
  const path = join(dir(), "file");
  if (text !== undefined) writeFileSync(path, text);
  return pathToFileURL(path);
};
const failed = (results) => results.filter(({ ok }) => !ok);
const core = () => readFileSync(join(ROOT, at(".claude/kitchen/docs/BLOCKERS.core.md")), "utf8");

describe("checkConfig", () => {
  it("passes a file the schema accepts", () => {
    assert.deepEqual(failed(checkConfig(file(JSON.stringify(minimal)))), []);
  });

  it("names the key the schema refuses, and the row that fixes it", () => {
    const [problem] = failed(checkConfig(file(JSON.stringify({ ...minimal, expo: { webPort: "8081" } }))));
    assert.match(problem.detail, /expo\.webPort must be number/);
    assert.equal(problem.row, `${ROW} · \`kitchen:config-invalid\``);
  });

  it("says the file is missing, which is a different fix", () => {
    assert.match(failed(checkConfig(file()))[0].row, /kitchen:config-missing/);
  });
});

describe("checkDenylist", () => {
  it("passes an empty list, which is the default a project starts with", () => {
    assert.deepEqual(failed(checkDenylist(file(""))), []);
  });

  it("passes a list that ends in a newline", () => {
    assert.deepEqual(failed(checkDenylist(file("Acme\nacme/app\n"))), []);
  });

  it("refuses a blank line, which grep -F -f matches against everything", () => {
    for (const text of ["\n", "Acme\n\nacme/app\n"])
      assert.match(failed(checkDenylist(file(text)))[0].row, /kitchen:denylist-blank-line/, JSON.stringify(text));
  });

  it("names a missing list", () => {
    assert.match(failed(checkDenylist(file()))[0].row, /kitchen:denylist-missing/);
  });
});

describe("checkAdapters", () => {
  it("passes every slot of the default adapters, whose actions all exist and parse", () => {
    assert.deepEqual(failed(checkAdapters(resolve(minimal))), []);
  });

  it("names a slot whose adapter has no files", () => {
    const [problem] = failed(checkAdapters(resolve({ ...minimal, adapters: { errors: "nowhere" } })));
    assert.equal(problem.check, "adapter errors");
    assert.match(problem.detail, /nowhere: no top; no search/);
    assert.match(problem.row, /kitchen:adapter-contract/);
  });
});

describe("checkWorkflows", () => {
  it("names each kitchen workflow a project lacks", () => {
    const root = dir();
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    writeFileSync(join(root, ".github/workflows/kitchen-scripts.yml"), "");
    const [problem] = failed(checkWorkflows(root));
    assert.match(problem.detail, /kitchen-bootstrap\.yml/);
    assert.doesNotMatch(problem.detail, /kitchen-scripts\.yml/);
  });

  it("passes a project with all of them", () => {
    const root = dir();
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    for (const name of WORKFLOWS) writeFileSync(join(root, ".github/workflows", `kitchen-${name}.yml`), "");
    assert.deepEqual(failed(checkWorkflows(root)), []);
  });

  it("knows every workflow the kitchen ships", () => {
    for (const name of WORKFLOWS) assert.ok(readFileSync(join(ROOT, at(`.github/workflows/kitchen-${name}.yml`))));
  });
});

describe("checkGitHub", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const answer = (routes) => {
    globalThis.fetch = async (url) => {
      const path = new URL(url).pathname;
      const [, body] = Object.entries(routes).find(([prefix]) => path.endsWith(prefix)) ?? [];
      return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body };
    };
  };

  it("needs a token, and says which row gets one", async () => {
    assert.match(failed(await checkGitHub(resolve(minimal), ""))[0].row, /kitchen:doctor-no-token/);
  });

  it("names the labels and workflows the repo lacks, and a runner variable that disagrees", async () => {
    const config = resolve({ ...minimal, ci: { runner: "big-ubuntu" } });
    answer({
      "/labels": [{ name: "blocked" }],
      "/actions/workflows": { workflows: [{ path: ".github/workflows/kitchen-scripts.yml" }] },
    });
    const problems = failed(await checkGitHub(config, "token"));
    assert.deepEqual(
      problems.map(({ check }) => check),
      ["labels", "workflows on GitHub", "variable KITCHEN_RUNNER"],
    );
    assert.doesNotMatch(problems[0].detail, /\bblocked\b/);
    assert.match(problems[2].detail, /ubuntu-latest.*big-ubuntu/);
  });

  it("passes a repo that has everything kitchen.json names", async () => {
    const config = resolve(minimal);
    answer({
      "/labels": Object.values(config.labels).map((name) => ({ name })),
      "/actions/workflows": { workflows: WORKFLOWS.map((name) => ({ path: `.github/workflows/kitchen-${name}.yml` })) },
    });
    assert.deepEqual(failed(await checkGitHub(config, "token")), []);
  });
});

describe("checkSessionUp", () => {
  const project = (sessionUp, capture) => {
    const root = dir();
    const scripts = join(root, ".claude/kitchen/scripts");
    mkdirSync(scripts, { recursive: true });
    writeFileSync(join(scripts, "session-up.sh"), sessionUp);
    chmodSync(join(scripts, "session-up.sh"), 0o755);
    writeFileSync(join(scripts, "capture.mjs"), capture);
    return root;
  };
  const CAPTURE = `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
writeFileSync(args[args.indexOf("--out") + 1], "png " + args[args.indexOf("--url") + 1]);
`;

  it("brings the app up, shoots home and takes it down", () => {
    const root = project('#!/bin/sh\n[ "$1" = up ] && echo http://localhost:8081\nexit 0\n', CAPTURE);
    const [shot] = checkSessionUp(resolve(minimal), root);
    assert.equal(shot.ok, true, shot.detail);
    assert.match(shot.detail, /390×844/);
    assert.equal(readFileSync(join(root, ".claude/tmp/doctor/home.png"), "utf8"), "png http://localhost:8081/");
  });

  it("names the session-up row when the app never comes up", () => {
    const root = project('#!/bin/sh\necho "no database" >&2\nexit 1\n', CAPTURE);
    const [problem] = checkSessionUp(resolve(minimal), root);
    assert.match(problem.detail, /no database/);
    assert.match(problem.row, /kitchen:session-up/);
  });
});

describe("what doctor prints", () => {
  it("puts each failure's row under it", () => {
    const text = format([
      { check: "config", ok: true, detail: "fine" },
      { check: "labels", ok: false, detail: "missing x", row: "r" },
    ]);
    assert.equal(text, "ok    config: fine\nFAIL  labels: missing x\n      → r");
  });

  it("names a colour and a description for every label kitchen.json has", () => {
    assert.deepEqual(Object.keys(LABELS).sort(), Object.keys(DEFAULTS.labels).sort());
    for (const [name, color] of labelRows(resolve(minimal))) assert.match(color, /^[0-9A-F]{6}$/, name);
  });

  it("names only rows BLOCKERS.core.md has", () => {
    const keys = [
      ...readFileSync(new URL("./doctor.mjs", import.meta.url), "utf8").matchAll(/"(kitchen:[a-z-]+)"/g),
    ].map((match) => match[1]);
    assert.ok(keys.length >= 8);
    assert.deepEqual([...new Set(keys)].filter((key) => !core().includes(`\`${key}\``)), []);
    assert.match(core(), /^## Setting up the kitchen$/m);
  });
});
