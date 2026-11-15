import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { WORKFLOWS } from "./doctor.mjs";
import { denylist } from "./kitchen.mjs";
import { exists, ROOT, workflow as workflowPath } from "./layout.mjs";

const read = (path) => readFileSync(join(ROOT, path), "utf8");

const DENYLIST = denylist();

const LINUX = "${{ vars.KITCHEN_RUNNER || 'ubuntu-latest' }}";
const MAC = "${{ vars.KITCHEN_MAC_RUNNER || 'macos-latest' }}";


const BACKENDS = [/drizzle/i, /better[- ]?auth/i, /posthog/i, /supabase/i, /\bturbo\b/i, /mongo/i];

const jobBlock = (text, job) => {
  const start = text.indexOf(`\n  ${job}:\n`);
  assert.notEqual(start, -1, `no job named ${job}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
};

const runners = (text) => [...text.matchAll(/^\s*runs-on:\s*(.+?)\s*$/gm)].map((match) => match[1]);

const workflow = (name) => read(workflowPath(name));

const step = (text, name) => {
  const start = text.indexOf(`- name: ${name}`);
  assert.notEqual(start, -1, `no step named ${name}`);
  const next = text.indexOf("\n      - ", start + 1);
  return next === -1 ? text.slice(start) : text.slice(start, next);
};

describe("every kitchen workflow", () => {
  for (const name of WORKFLOWS) {
    describe(name, () => {
      it("is where the layout puts it", () => assert.ok(exists(`.github/workflows/kitchen-${name}.yml`)));

      it("carries nothing from kitchen-denylist.txt", () => {
        const lower = workflow(name).toLowerCase();
        assert.deepEqual(DENYLIST.filter((literal) => lower.includes(literal)), []);
      });

      it("names no backend an adapter owns", () => {
        const text = workflow(name);
        assert.deepEqual(BACKENDS.filter((pattern) => pattern.test(text)).map(String), []);
      });

      it("takes its runner from a repository variable, except a job that runs before any is set", () => {
        const found = runners(workflow(name));
        assert.notEqual(found.length, 0);
        const allowed = name === "bootstrap" ? [LINUX, MAC, "ubuntu-latest"] : [LINUX, MAC];
        assert.deepEqual(found.filter((runner) => !allowed.includes(runner)), []);
      });

      it("runs no package manager by name, only install.sh and kitchen.json's", () => {
        assert.deepEqual(
          workflow(name)
            .split("\n")
            .filter((line) => /\b(pnpm|yarn|bun)\s+(install|add|exec|run|dlx|i)\b|\bnpm (ci|run)\b/.test(line)),
          [],
        );
      });

      it("runs only kitchen scripts that exist", () => {
        const missing = [...workflow(name).matchAll(/\.claude\/kitchen\/scripts\/([\w.-]+)/g)]
          .map((match) => `.claude/kitchen/scripts/${match[1]}`)
          .filter((path) => !exists(path));
        assert.deepEqual([...new Set(missing)], []);
      });

      it("starts no database of its own", () => {
        assert.deepEqual([/docker run/, /fixture-dictionary/].filter((pattern) => pattern.test(workflow(name))), []);
      });
    });
  }
});

describe("verify-expo", () => {
  it("puts only its macOS job on the macOS runner", () => {
    const text = workflow("verify-expo");
    assert.deepEqual(runners(jobBlock(text, "flows")), [LINUX]);
    assert.deepEqual(runners(jobBlock(text, "ios")), [MAC]);
  });

  it("starts the API through the stack adapter, before the build inlines its URL", () => {
    const text = workflow("verify-expo");
    assert.ok(text.indexOf("adapter.mjs stack up") < text.indexOf("eas build"));
    assert.match(step(text, "Start the API"), /\$KITCHEN_API_URL_ENV=/);
  });
});

describe("the app's environment", () => {
  for (const name of ["shoot-expo-web", "verify-expo", "pr-preview"]) {
    it(`${name} writes it from kitchen.json's ci.secrets and ci.vars, through ci-env.mjs`, () => {
      const text = step(workflow(name), "Write the app's environment");
      assert.match(text, /KITCHEN_SECRETS_JSON: \$\{\{ toJSON\(secrets\) \}\}/);
      assert.match(text, /ci-env\.mjs --eas/);
    });
  }
});

describe("shoot-expo-web's push step", () => {
  const push = () => step(workflow("shoot-expo-web"), "Push the shots to evidence/<pr>");

  it("refuses a run that took no screenshot at all", () => {
    assert.match(push(), /\$\{#shots\[@\]\}" -eq 0/);
  });

  it("hosts a run whose every shot is a failure shot, since that is a Before for a feature not built yet", () => {
    assert.doesNotMatch(push(), /-failure\.png/);
  });

  it("pushes the shots through the evidence host's push-shots.sh", () => {
    assert.match(push(), /\.claude\/kitchen\/scripts\/push-shots\.sh/);
  });
});

describe("shoot-expo-web's drive", () => {
  const drive = () => step(workflow("shoot-expo-web"), "Drive the flows");

  it("shoots both halves with the shoot-pair.sh /evidence uses", () => {
    assert.match(drive(), /\.claude\/kitchen\/scripts\/shoot-pair\.sh/);
  });

  it("stands a branch-only run up through session-up.sh, so the adapters seed and sign in", () => {
    assert.match(drive(), /\.claude\/kitchen\/scripts\/session-up\.sh up/);
  });
});

describe("bootstrap", () => {
  it("creates the labels doctor.mjs lists from kitchen.json", () => {
    assert.match(workflow("bootstrap"), /doctor\.mjs --labels/);
  });

  it("is dispatched by hand and by nothing else", () => {
    assert.match(workflow("bootstrap"), /^on:\n {2}workflow_dispatch:\n/m);
  });
});
