import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { at, isProjectFile, resolveLink, ROOT, skillNames } from "./layout.mjs";

const filesUnder = (dir) =>
  existsSync(join(ROOT, at(dir)))
    ? readdirSync(join(ROOT, at(dir))).flatMap((name) => {
        const path = `${dir}/${name}`;
        return statSync(join(ROOT, at(path))).isDirectory() ? filesUnder(path) : [path];
      })
    : [];

const SOURCES = [
  ...skillNames().flatMap((name) => filesUnder(`.claude/skills/${name}`)),
  ...filesUnder(".claude/agents"),
  ...filesUnder(".claude/kitchen/docs"),
  ...filesUnder(".claude/kitchen/adapters"),
].filter((path) => path.endsWith(".md"));

const withoutCode = (text) => text.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "").replace(/`[^`\n]*`/g, "");

const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

const anchors = (path) =>
  new Set(
    [...readFileSync(join(ROOT, path), "utf8").replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "").matchAll(/^#{1,6} (.+)$/gm)].map(
      (match) => slug(match[1]),
    ),
  );

export function brokenLinks(from) {
  const text = withoutCode(readFileSync(join(ROOT, at(from)), "utf8"));
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("#"))
    .filter((target) => {
      const [file, anchor] = target.split("#");
      const { into, path, project } = resolveLink(from, file);
      if (project) return false;
      if (!existsSync(join(ROOT, path))) return true;
      if (!anchor || !path.endsWith(".md") || statSync(join(ROOT, path)).isDirectory()) return false;
      return !anchors(path).has(anchor) && !isProjectFile(into);
    })
    .map((target) => `${from} → ${target}`);
}

describe("every relative link in what the kitchen ships", () => {
  it("is checked over the skills, agents, docs and adapters", () => assert.ok(SOURCES.length > 40));

  for (const path of SOURCES) it(`resolves from ${path}`, () => assert.deepEqual(brokenLinks(path), []));
});
