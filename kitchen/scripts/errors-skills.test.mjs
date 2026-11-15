import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { load } from "./kitchen.mjs";
import { at, ROOT } from "./layout.mjs";

const GUIDE = at(".claude/kitchen/adapters/errors/posthog/GUIDE.md");

const SKILLS = {
  "search-errors": "search",
  "fix-top-error": "top",
};

const VOCABULARY = [
  "posthog",
  "$exception",
  "execute-sql",
  "hogql",
  "query-error-tracking",
  "error-tracking-external-references",
  "switch-organization",
  "switch-project",
  "project-get",
  "projects-get",
];

const filesUnder = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

const textOf = (skill) =>
  filesUnder(join(ROOT, at(`.claude/skills/${skill}`)))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

const { errors } = load().adapters;
const pins = [errors.organization, errors.project, errors.projectName, errors.timezone, errors.decoyProject, errors.doc]
  .filter((pin) => pin !== null && pin !== undefined)
  .map(String);

describe("the error skills reach the tracker only through the errors adapter", () => {
  for (const [skill, action] of Object.entries(SKILLS)) {
    describe(skill, () => {
      it("names no tracker vocabulary", () => {
        const text = textOf(skill).toLowerCase();
        assert.deepEqual(
          VOCABULARY.filter((word) => text.includes(word)),
          [],
        );
      });

      it("names no id, name or timezone kitchen.json's errors adapter carries", () => {
        const text = textOf(skill).toLowerCase();
        assert.deepEqual(
          pins.filter((pin) => text.includes(pin.toLowerCase())),
          [],
        );
      });

      it(`asks the adapter for ${action}`, () => {
        assert.match(textOf(skill), new RegExp(`adapter\\.mjs errors ${action}\\b`));
      });

      it("follows the guide the adapter names, not a copy of its steps", () => {
        assert.match(textOf(skill), /`guide`/);
      });

      it("says what an adapter that is off means", () => {
        assert.match(textOf(skill), /`enabled`[^\n]*false/);
      });
    });
  }

  it("/fix-top-error stops on `none · ` followed by the adapter's reason", () => {
    assert.match(textOf("fix-top-error"), /`none · <reason>`/);
  });

  it("/fix-top-error stops before it claims, branches or comments", () => {
    const text = textOf("fix-top-error");
    const off = text.search(/`enabled`[^\n]*false/);
    const claim = text.search(/^## \d+\. Claim$/m);
    assert.ok(off !== -1 && claim !== -1 && off < claim);
  });
});

describe("what the skills used to carry has a home", () => {
  it("the posthog guide holds the calls the skills made", () => {
    assert.ok(existsSync(join(ROOT, GUIDE)), `${GUIDE} is missing`);
    const text = readFileSync(join(ROOT, GUIDE), "utf8");
    for (const call of [
      "project-get",
      "switch-organization",
      "switch-project",
      "execute-sql",
      "query-error-tracking-issues-list",
      "query-error-tracking-issue-events",
      "error-tracking-external-references-create",
    ])
      assert.ok(text.includes(call), `${call} is not in the guide`);
  });

  it("leaves the project's own error doc to the setting that names it", () => {
    for (const skill of Object.keys(SKILLS)) {
      assert.doesNotMatch(textOf(skill), /docs\/observability/, skill);
      assert.match(textOf(skill), /`kitchen\.adapters\.errors\.doc`/, skill);
    }
  });

  it("/fix-top-error sends the agent to the error doc's section on what the sweep skips", () => {
    assert.match(textOf("fix-top-error"), /\*\*What the sweep skips\*\* in the error doc/);
  });
});
