import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { denylist, get, load, trusted } from "./kitchen.mjs";
import { at, exists, ROOT } from "./layout.mjs";

const LOOP_SKILLS = [
  "find-work",
  "pick-up-ticket",
  "drive-pr-green",
  "unblock",
  "risk-review",
  "post-comment",
  "screenshot",
  "search-errors",
  "fix-top-error",
];

const EXPO_SKILLS = [
  "implement",
  "code-review",
  "evidence",
  "design-review",
  "design-setup",
  "verify-expo",
];

const SKILLS = [...LOOP_SKILLS, ...EXPO_SKILLS];

const AGENTS = [
  "implementer",
  "code-reviewer",
  "content-reviewer",
  "evidence-runner",
  "design-reviewer",
  "risk-reviewer",
  "blocker-fixer",
];

const DENYLIST = denylist();

const filesUnder = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

const textOf = (skill) =>
  filesUnder(join(ROOT, at(`.claude/skills/${skill}`)))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

const agentText = (agent) =>
  readFileSync(join(ROOT, at(`.claude/agents/${agent}.md`)), "utf8");

const kitchen = load();

describe("a kitchen skill names no project", () => {
  for (const skill of SKILLS) {
    it(`${skill} carries nothing from kitchen-denylist.txt`, () => {
      const text = textOf(skill).toLowerCase();
      assert.deepEqual(
        DENYLIST.filter((literal) => text.includes(literal)),
        [],
      );
    });

    it(`${skill} names no human by handle`, () => {
      const text = textOf(skill);
      assert.deepEqual(
        trusted(kitchen).filter((handle) => text.includes(handle)),
        [],
      );
    });

    it(`${skill} names no label a hyphen or colon marks as this project's`, () => {
      const text = textOf(skill).replaceAll(/Next · [\w-]+|\]\([^)]*\)/g, "");
      const literals = Object.values(kitchen.labels).filter((label) =>
        /[-:]/.test(label),
      );
      assert.deepEqual(
        literals.filter((label) => text.includes(label)),
        [],
      );
    });

    it(`${skill} names no base branch in a ref`, () => {
      assert.deepEqual(
        [`origin/${kitchen.baseBranch}`].filter((ref) =>
          textOf(skill).includes(ref),
        ),
        [],
      );
    });
  }
});

describe("every kitchen.<key> a kitchen skill reads is a key the kitchen has", () => {
  const FILES = new Set(["json", "mjs"]);

  for (const skill of SKILLS) {
    it(skill, () => {
      const paths = [
        ...textOf(skill).matchAll(
          /\bkitchen\.([A-Za-z]\w*(?:\.[A-Za-z]\w*)*)/g,
        ),
      ]
        .map((match) => match[1])
        .filter((path) => !FILES.has(path));
      const unknown = paths.filter((path) => {
        try {
          get(kitchen, path);
          return false;
        } catch {
          return true;
        }
      });
      assert.deepEqual([...new Set(unknown)], []);
    });
  }
});

describe("every script a kitchen skill runs is where it lives", () => {
  const SCRIPT = /\.claude\/(kitchen\/)?scripts\/([\w.-]+\.(?:mjs|sh))/g;

  for (const skill of SKILLS) {
    it(skill, () => {
      const missing = [...textOf(skill).matchAll(SCRIPT)]
        .map((match) => match[0])
        .filter((path) => !exists(path));
      assert.deepEqual([...new Set(missing)], []);
    });
  }
});

describe("a kitchen agent names no project", () => {
  for (const agent of AGENTS) {
    it(`${agent} carries nothing from kitchen-denylist.txt`, () => {
      const text = agentText(agent).toLowerCase();
      assert.deepEqual(
        DENYLIST.filter((literal) => text.includes(literal)),
        [],
      );
    });

    it(`${agent} reads only keys the kitchen has`, () => {
      const unknown = [
        ...agentText(agent).matchAll(
          /\bkitchen\.([A-Za-z]\w*(?:\.[A-Za-z]\w*)*)/g,
        ),
      ]
        .map((match) => match[1])
        .filter((path) => !["json", "mjs"].includes(path))
        .filter((path) => {
          try {
            get(kitchen, path);
            return false;
          } catch {
            return true;
          }
        });
      assert.deepEqual([...new Set(unknown)], []);
    });
  }
});

describe("a PR the session cannot act on does not stop the loop reaching a ticket", () => {
  const BLOCKS = textOf("drive-pr-green");
  const KEY = "connectors:session-pr-branch-push";

  it("drive-pr-green blocks on a refused push to the PR's branch, under an area that has an owner", () => {
    assert.ok(BLOCKS.includes(KEY));
    assert.ok(Object.hasOwn(kitchen.humans.areas, KEY.split(":")[0]));
  });

  it("the key has a row in the kitchen's own blockers, since every project meets it", () => {
    const rows = readFileSync(join(ROOT, at(".claude/kitchen/docs/BLOCKERS.core.md")), "utf8");
    assert.ok(rows.includes(KEY));
  });

  it("drive-pr-green blocks a PR claims.mjs reads as stalled, so no count keeps it", () => {
    assert.match(BLOCKS, /^- stalled: `claims\.mjs` reads `stalled`/m);
    assert.match(BLOCKS, /dropped as stalled gets step 10's block now/);
    assert.ok(BLOCKS.includes("`infra:drive-stalled`"));
  });

  it("drive-pr-green names the three ways a claim ends", () => {
    for (const form of ["· done ·", "· blocked · #<issue> ·", "· lost to <winning id> ·"])
      assert.ok(BLOCKS.includes(form), form);
  });

  for (const skill of ["drive-pr-green", "pick-up-ticket", "unblock", "fix-top-error"])
    it(`${skill} reads claims through claims.mjs, not a 24h rule of its own`, () => {
      const text = textOf(skill);
      assert.ok(text.includes("claims.mjs"));
      assert.doesNotMatch(text, /under 24h old/);
    });

  it("find-work goes to the next queue on an output that is not a receipt", () => {
    assert.match(textOf("find-work"), /No receipt .*finished nothing/s);
  });
});

describe("a tick holds its item and its skill, never the queues", () => {
  for (const skill of ["find-work", "drive-pr-green", "pick-up-ticket", "unblock"])
    it(`${skill} chooses through next-work.mjs`, () => assert.ok(textOf(skill).includes("next-work.mjs")));

  it("find-work lists no queue itself", () =>
    assert.doesNotMatch(textOf("find-work"), /list_pull_requests|list_issues|search_pull_requests|get_comments/));

  it("no skill reads comments to choose: a claim is a label the script sees", () => {
    for (const skill of ["find-work", "drive-pr-green", "pick-up-ticket", "unblock", "fix-top-error"])
      assert.ok(textOf(skill).includes("kitchen.labels.claimed"), skill);
    assert.doesNotMatch(textOf("find-work"), /queue-reader|need ·/);
  });
});
