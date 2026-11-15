import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { embedPrefixes, shotUrls } from "./comment-body.mjs";
import { escapeRegExp, load } from "./kitchen.mjs";

const DB_PATHS = [
  /^packages\/db\/src\/schema(\.ts$|\/)/,
  /^packages\/db\/migrations\//,
];

const SKILL_PATHS = [/^\.claude\//, /^docs\/agents\//, /^CLAUDE\.md$/];

const DEPENDS_ON = /^Depends on:\s*#\d+/im;

const branchShot = (repo) =>
  new RegExp(
    String.raw`https://github\.com/${escapeRegExp(repo)}/blob/[0-9a-f]{40}/\d+/[^\s)"'<>]+\.png\?raw=true`,
  );

export function owned(kitchen) {
  return {
    db: kitchen.labels.dbChange,
    skill: kitchen.labels.skillChange,
    depends: kitchen.labels.dependsOnPr,
    evidence: kitchen.labels.evidence,
  };
}

export function labelsFor({ paths = [], body = "" }, kitchen = load()) {
  const names = owned(kitchen);
  const labels = [];
  if (paths.some((path) => DB_PATHS.some((pattern) => pattern.test(path))))
    labels.push(names.db);
  if (paths.some((path) => SKILL_PATHS.some((pattern) => pattern.test(path))))
    labels.push(names.skill);
  if (DEPENDS_ON.test(body)) labels.push(names.depends);
  if (shotUrls(body, embedPrefixes(kitchen)).length > 0 || branchShot(kitchen.repo).test(body))
    labels.push(names.evidence);
  return labels;
}

// The GitHub MCP's issue_write replaces a PR's whole label set, so this hands back the set to
// write rather than what to add: every label it does not own survives untouched.
export function relabel(current, change, kitchen = load()) {
  const mine = new Set(Object.values(owned(kitchen)));
  const kept = current.filter((label) => !mine.has(label));
  return [...new Set([...kept, ...labelsFor(change, kitchen)])];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [bodyFile, ...current] = process.argv.slice(2);
  if (!bodyFile) {
    process.stderr.write(
      "usage: git diff --name-only origin/main...HEAD | pr-labels.mjs <body.md> [current-label...]\n",
    );
    process.exit(2);
  }
  const paths = readFileSync(0, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const body = readFileSync(bodyFile, "utf8");

  for (const label of relabel(current, { paths, body })) console.log(label);
}
