import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { get, resolve } from "./kitchen.mjs";
import { at, ROOT } from "./layout.mjs";

const skill = () => readFileSync(join(ROOT, at(".claude/skills/kitchen-setup/SKILL.md")), "utf8");

describe("/kitchen-setup", () => {
  it("is a skill a person runs, never one a model reaches for", () => {
    assert.match(skill(), /^disable-model-invocation: true$/m);
  });

  it("asks for the repo, the humans, an adapter per slot, the errors project and the design source", () => {
    for (const section of ["Repo", "Humans", "An adapter per slot", "The errors project", "The design source"])
      assert.match(skill(), new RegExp(`\\*\\*[A-G] · ${section}\\.\\*\\*`), section);
  });

  it("names every key it writes as a key the schema has", () => {
    const config = resolve({ repo: "acme/app", humans: { default: "a" } });
    const keys = [...skill().matchAll(/`((?:humans|expo|ci|routines|adapters|labels|conventions)\.[a-zA-Z.]+)`/g)].map(
      (match) => match[1],
    );
    assert.ok(keys.length > 5);
    assert.deepEqual(
      keys.filter((key) => {
        try {
          get(config, key);
          return false;
        } catch {
          return true;
        }
      }),
      [],
    );
  });

  it("never writes a blank line into the denylist, and writes an empty one as zero bytes", () => {
    assert.match(skill(), /: > kitchen-denylist\.txt/);
    assert.match(skill(), /Never a blank line/);
  });

  it("dispatches the bootstrap workflow for the labels", () => {
    assert.match(skill(), /`kitchen-bootstrap\.yml`/);
  });

  it("creates the work Routine hourly, and the errors one only when the Fix loop is on", () => {
    assert.match(skill(), /\| work \| `routines\.work` \| hourly \| `\/find-work`/);
    assert.match(skill(), /Create `errors` only when the errors adapter is not `none`/);
  });

  it("names no adapter, so it offers what this kitchen ships rather than a list that rots", () => {
    assert.doesNotMatch(skill(), /supabase|posthog|drizzle|better-auth|trpc/i);
  });

  it("ends on doctor, whose failures name their rows", () => {
    assert.match(skill(), /doctor\.mjs/);
    assert.match(skill(), /BLOCKERS\.core\.md#setting-up-the-kitchen/);
  });
});
