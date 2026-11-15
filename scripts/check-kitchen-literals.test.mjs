import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADAPTER_WORDS_ALLOWED, check, problems } from "./check-kitchen-literals.mjs";

describe("problems", () => {
  it("passes this repo, the upstreams it credits, and placeholder owners", () => {
    const text = "https://github.com/jacksontriffon/skills · github.com/mattpocock/skills · someone/app#4 · github.com/acme/app";
    assert.deepEqual(problems("kitchen/docs/a.md", text), []);
  });

  it("names any other repo, by URL or by a cross-repo reference", () => {
    assert.equal(problems("kitchen/docs/a.md", "see https://github.com/big-co/product/pull/9").length, 1);
    assert.equal(problems("kitchen/docs/a.md", "per big-co/product#971").length, 1);
    assert.equal(problems("kitchen/docs/a.md", "raw.githubusercontent.com/big-co/product/main/x").length, 1);
  });

  it("leaves a link to a file's heading alone", () => {
    assert.deepEqual(problems("kitchen/docs/a.md", "[step](../pick-up-ticket/SKILL.md#1-pick)"), []);
  });

  it("names an app id outside com.example", () => {
    assert.deepEqual(problems("kitchen/docs/a.md", "com.example.app"), []);
    assert.equal(problems("kitchen/docs/a.md", "appId: com.bigco.product").length, 1);
  });

  it("holds the adapter vocabulary to kitchen/adapters, and to the files standing in for a backend", () => {
    assert.equal(problems("kitchen/skills/evidence/SKILL.md", "run the Supabase CLI").length, 1);
    assert.equal(problems("kitchen/docs/a.md", "a Drizzle migration").length, 1);
    assert.equal(problems("skills/tdd/SKILL.md", "PostHog").length, 1);
    assert.deepEqual(problems("kitchen/adapters/db/README.md", "Drizzle"), []);
    assert.deepEqual(problems("kitchen/scripts/adapters-db.test.mjs", "Drizzle"), []);
    assert.deepEqual(problems("kitchen/scripts/fixtures/kitchen.json", "posthog"), []);
  });

  it("allows the adapter vocabulary in a short list of files, each with its reason", () => {
    assert.ok(Object.keys(ADAPTER_WORDS_ALLOWED).length <= 3);
    for (const [path, reason] of Object.entries(ADAPTER_WORDS_ALLOWED)) {
      assert.deepEqual(problems(path, "supabase"), []);
      assert.ok(reason.length > 10);
    }
  });

  it("matches a project's own denylist in any case, when one is given", () => {
    assert.equal(problems("kitchen/docs/a.md", "Built for BIGCO", ["bigco"]).length, 1);
  });
});

describe("kitchen/ and skills/", () => {
  it("name no project", () => assert.deepEqual(check(), []));
});
