import { readFileSync } from "node:fs";
import { join } from "node:path";

import { at, exists, ROOT } from "./layout.mjs";

export const UNATTENDED = [
  "code-review",
  "content-design",
  "content-draft",
  "content-fix",
  "content-judge",
  "content-loop",
  "content-monitor",
  "content-promote",
  "content-publish",
  "content-research",
  "content-review",
  "design-review",
  "drive-pr-green",
  "evidence",
  "find-work",
  "fix-top-error",
  "implement",
  "merge-order",
  "pick-up-ticket",
  "post-comment",
  "retest-pr",
  "risk-review",
  "screenshot",
  "search-errors",
  "test-pr",
  "unblock",
  "verify-expo",
];

export const V2 = [
  "content-design",
  "content-draft",
  "content-fix",
  "content-judge",
  "content-loop",
  "content-monitor",
  "content-promote",
  "content-publish",
  "content-research",
  "merge-order",
  "retest-pr",
  "test-pr",
];

export const carried = (name) => exists(`.claude/skills/${name}/SKILL.md`);

export const notCarried = (name) =>
  !carried(name) && V2.includes(name) && `${name} is a v2 skill this checkout does not carry`;

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const STEP = /^## (\d+)\. (.+)$/gm;

const BLOCKERS = /BLOCKERS\.md[)#]/;
const CORE_BLOCKERS = /BLOCKERS\.core\.md[)#]/;
const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})/;
const CLOCK = /\bdate -u\b/;

function steps(source) {
  const heads = [...source.matchAll(STEP)];
  return heads.map((head, index) => ({
    number: Number(head[1]),
    title: head[2],
    body: source.slice(
      head.index,
      index + 1 < heads.length ? heads[index + 1].index : source.length,
    ),
  }));
}

export function checkShape(name, source) {
  const problems = [];

  const front = FRONTMATTER.exec(source);
  if (!front) problems.push("no frontmatter");
  else {
    if (!new RegExp(`^name: ${name}$`, "m").test(front[1]))
      problems.push(`frontmatter name is not "${name}"`);
    if (!/^description: \S/m.test(front[1]))
      problems.push("frontmatter has no description");
  }

  const numbered = steps(source);
  if (numbered.length < 2) problems.push("fewer than two numbered steps");
  numbered.forEach((step, index) => {
    if (step.number !== index + 1)
      problems.push(`step ${index + 1} is numbered ${step.number}`);
    if (!/^Done when \S/m.test(step.body))
      problems.push(`step ${step.number} (${step.title}) has no "Done when" line`);
  });

  numbered.forEach((step) => {
    const time = step.body.search(ISO_TIME);
    const clock = step.body.search(CLOCK);
    if (time !== -1 && (clock === -1 || clock > time))
      problems.push(
        `step ${step.number} (${step.title}) writes an ISO time with no "date -u" to read it`,
      );
  });

  if (!BLOCKERS.test(source)) problems.push("no pointer to BLOCKERS.md");
  if (!CORE_BLOCKERS.test(source)) problems.push("no pointer to BLOCKERS.core.md");
  if (!/^## Output$/m.test(source)) problems.push("no Output section");

  return problems;
}

export function readSkill(name) {
  return readFileSync(join(ROOT, at(`.claude/skills/${name}/SKILL.md`)), "utf8");
}
