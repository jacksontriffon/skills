import { existsSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("./", import.meta.url));

export const VENDORED = /[\\/]\.claude[\\/]kitchen[\\/]scripts[\\/]$/.test(HERE);

export const ROOT = fileURLToPath(new URL(VENDORED ? "../../../" : "../../", import.meta.url));

export const FIXTURE_CONFIG = "kitchen/scripts/fixtures/kitchen.json";

export const PROJECT_FILES = [
  ".claude/kitchen.json",
  ".claude/BLOCKERS.md",
  ".claude/settings.json",
  "kitchen-denylist.txt",
  "CLAUDE.md",
  "package.json",
  "docs/agents/issue-tracker.md",
  "docs/agents/triage-labels.md",
  "docs/agents/domain.md",
  "docs/design/README.md",
  "docs/design/DEVIATIONS.md",
  ".maestro/README.md",
  ".maestro/config.yaml",
  ".maestro/flows/home.yaml",
];

const TO_SOURCE = [
  [".claude/kitchen.json", FIXTURE_CONFIG],
  [".claude/agents", "kitchen/agents"],
  [".github/workflows/kitchen-", "kitchen/workflows/"],
  [".claude/kitchen", "kitchen"],
];

const TO_VENDORED = [
  ["kitchen/skills", ".claude/skills"],
  ["skills", ".claude/skills"],
  ["kitchen/agents", ".claude/agents"],
  ["kitchen/workflows/", ".github/workflows/kitchen-"],
  ["kitchen", ".claude/kitchen"],
];

const under = (path, prefix) =>
  prefix.endsWith("/") || prefix.endsWith("-")
    ? path.startsWith(prefix)
    : path === prefix || path.startsWith(`${prefix}/`);

export function at(path) {
  if (VENDORED) return path;
  const skill = /^\.claude\/skills\/([^/]+)(\/.*)?$/.exec(path);
  if (skill) {
    const kitchen = `kitchen/skills/${skill[1]}`;
    return `${existsSync(join(ROOT, kitchen)) ? kitchen : `skills/${skill[1]}`}${skill[2] ?? ""}`;
  }
  for (const [vendored, source] of TO_SOURCE)
    if (under(path, vendored)) return source + path.slice(vendored.length);
  return path;
}

export function vendored(path) {
  if (VENDORED) return path;
  for (const [source, target] of TO_VENDORED)
    if (under(path, source)) return target + path.slice(source.length);
  return path;
}

export const isProjectFile = (path) =>
  PROJECT_FILES.some((file) => file === path || file.startsWith(`${path.replace(/\/$/, "")}/`));

export function exists(path) {
  if (existsSync(join(ROOT, at(path)))) return true;
  return !VENDORED && isProjectFile(path);
}

export function resolveLink(from, target) {
  const into = posix.normalize(posix.join(posix.dirname(vendored(from)), target));
  return { into, path: at(into), project: !VENDORED && isProjectFile(into) && !existsSync(join(ROOT, at(into))) };
}

export function skillNames() {
  const dirs = VENDORED ? [".claude/skills"] : ["kitchen/skills", "skills"];
  return dirs
    .filter((dir) => existsSync(join(ROOT, dir)))
    .flatMap((dir) =>
      readdirSync(join(ROOT, dir), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    )
    .sort();
}

export const workflow = (name) => at(`.github/workflows/kitchen-${name}.yml`);
