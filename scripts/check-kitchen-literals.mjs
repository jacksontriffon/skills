#!/usr/bin/env node
// The kitchen ships into every project, so nothing under kitchen/ or skills/ may name one. A
// project's own identifiers live in its kitchen-denylist.txt, which stays with the project, so
// this check holds the shared files to rules that need no list:
//
//   - no GitHub repo but this one and the upstreams it credits or runs
//   - no app id but the reserved com.example.*
//   - the adapter vocabulary only under kitchen/adapters/, where each backend has its own home
//
// `--denylist <file>` adds a project's own list, for a maintainer checking a lift by hand.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));

export const DIRS = ["kitchen", "skills"];

export const REPOS = new Set(["jacksontriffon/skills", "mattpocock/skills", "mobile-dev-inc/maestro"]);

export const PLACEHOLDER_OWNERS = new Set(["acme", "example", "other", "owner", "someone", "someone-else", "x"]);

export const ADAPTER_WORDS = /drizzle|better[- ]?auth|posthog|supabase/i;

export const STANDS_IN_FOR_A_BACKEND = /\.test\.mjs$|-stub\.mjs$|-fixtures\.mjs$|\/fixtures\//;

export const ADAPTER_WORDS_ALLOWED = {
  "kitchen/kitchen.schema.json": "names the default adapter of each slot",
  "kitchen/scripts/is-skippable-change.mjs": "skips the default backend's server-only functions for a preview",
};

const SLUG = /github\.com[/:]([\w.-]+)\/([\w.-]+)|raw\.githubusercontent\.com\/([\w.-]+)\/([\w.-]+)|(?<![\w/.-])([\w-]+)\/([\w-]+)#\d+/g;

const APP_ID = /\bcom\.([a-z0-9]+)\.[a-z0-9]+/g;

export function problems(path, text, denylist = []) {
  const found = [];
  for (const match of text.matchAll(SLUG)) {
    const [owner, repo] = [match[1] ?? match[3] ?? match[5], (match[2] ?? match[4] ?? match[6]).replace(/\.git$/, "")];
    if (!REPOS.has(`${owner}/${repo}`) && !PLACEHOLDER_OWNERS.has(owner.toLowerCase()))
      found.push(`${path}: names the repo ${owner}/${repo}`);
  }
  for (const match of text.matchAll(APP_ID))
    if (match[1] !== "example") found.push(`${path}: names the app id ${match[0]}`);
  if (
    ADAPTER_WORDS.test(text) &&
    !path.startsWith("kitchen/adapters/") &&
    !STANDS_IN_FOR_A_BACKEND.test(path) &&
    !(path in ADAPTER_WORDS_ALLOWED)
  )
    found.push(`${path}: names ${text.match(ADAPTER_WORDS)[0]}, which belongs under kitchen/adapters/`);
  const lower = text.toLowerCase();
  for (const literal of denylist) if (lower.includes(literal)) found.push(`${path}: carries "${literal}" from the denylist`);
  return found;
}

const filesUnder = (dir) =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    if (name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(join(ROOT, path)).isDirectory() ? filesUnder(path) : [path];
  });

export function check({ denylist = [] } = {}) {
  return DIRS.flatMap(filesUnder)
    .filter((path) => !/\.(png|jpe?g|gif|webp|ico)$/i.test(path))
    .flatMap((path) => problems(relative(ROOT, join(ROOT, path)), readFileSync(join(ROOT, path), "utf8"), denylist));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--denylist");
  const denylist =
    at === -1
      ? []
      : readFileSync(process.argv[at + 1], "utf8")
          .split("\n")
          .map((line) => line.trim().toLowerCase())
          .filter(Boolean);
  const found = check({ denylist });
  for (const line of found) console.error(line);
  console.log(found.length === 0 ? `kitchen/ and skills/ name no project.` : `${found.length} leaks.`);
  if (found.length > 0) process.exitCode = 1;
}
