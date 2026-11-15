import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { load, MODELS } from "./kitchen.mjs";

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const FIELD = (name) => new RegExp(`^${name}: (\\S.*)$`, "m");

export const LOOP_DISPATCHERS = [
  "drive-pr-green",
  "pick-up-ticket",
  "unblock",
  "test-pr",
  "retest-pr",
];

export { MODELS };

export const DEFAULT_MODELS = {
  implementer: "inherit",
  "code-reviewer": "inherit",
  "content-reviewer": "haiku",
  "evidence-runner": "haiku",
  "design-reviewer": "haiku",
  "risk-reviewer": "inherit",
  "blocker-fixer": "inherit",
};

const AGENTS_DIR = new URL("../../agents/", import.meta.url);

export function agentNames() {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3))
    .sort();
}

export function readAgent(name) {
  return readFileSync(new URL(`${name}.md`, AGENTS_DIR), "utf8");
}

export const modelFor = (config, name) =>
  config.agents[name]?.model ?? DEFAULT_MODELS[name];

export function withModel(source, model) {
  const front = FRONTMATTER.exec(source);
  const fields = front[1].split("\n").filter((line) => !/^model:/.test(line));
  if (model !== "inherit") fields.push(`model: ${model}`);
  return `---\n${fields.join("\n")}\n---\n${source.slice(front[0].length)}`;
}

export function modelProblem(name, source, config) {
  const model = modelFor(config, name);
  if (withModel(source, model) === source) return null;
  const has = FIELD("model").exec(FRONTMATTER.exec(source)?.[1] ?? "")?.[1];
  return `${name} runs on ${has ?? "inherit"} but kitchen.json says ${model}; run \`node .claude/kitchen/scripts/agents.mjs sync\``;
}

export function configProblems(config) {
  return Object.keys(config.agents)
    .filter((name) => !(name in DEFAULT_MODELS))
    .map(
      (name) =>
        `kitchen.json configures agents.${name}, which is not one of ${Object.keys(DEFAULT_MODELS).join(", ")}`,
    );
}

export function checkAgent(name, source) {
  const problems = [];
  const front = FRONTMATTER.exec(source);
  if (!front) return ["no frontmatter"];

  if (FIELD("name").exec(front[1])?.[1] !== name)
    problems.push(`frontmatter name is not "${name}"`);
  if (!FIELD("description").test(front[1]))
    problems.push("frontmatter has no description");

  const model = FIELD("model").exec(front[1])?.[1];
  if (model && !MODELS.includes(model))
    problems.push(`model "${model}" is not one of ${MODELS.join(", ")}`);

  if (source.slice(front[0].length).trim().length === 0)
    problems.push("no instructions after the frontmatter");

  return problems;
}

export function dispatchProblems(skill, source, known) {
  const problems = [];
  if (/`general-purpose`/.test(source))
    problems.push(
      `${skill} dispatches \`general-purpose\` instead of a named agent`,
    );
  for (const [, name] of source.matchAll(
    /\(\.\.\/\.\.\/agents\/([a-z-]+)\.md\)/g,
  ))
    if (!known.includes(name))
      problems.push(`${skill} links agents/${name}.md, which does not exist`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  if (!["sync", "check"].includes(command)) {
    process.stderr.write("usage: agents.mjs sync | check\n");
    process.exit(2);
  }
  const config = load();
  const problems = configProblems(config);
  for (const name of Object.keys(DEFAULT_MODELS)) {
    const source = readAgent(name);
    const model = modelFor(config, name);
    if (command === "sync" && problems.length === 0) {
      if (withModel(source, model) === source) continue;
      writeFileSync(
        new URL(`${name}.md`, AGENTS_DIR),
        withModel(source, model),
      );
      console.log(`${name}: model ${model}`);
    } else if (command === "check") {
      const problem = modelProblem(name, source, config);
      if (problem) problems.push(problem);
    }
  }
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  if (problems.length > 0) process.exitCode = 1;
}
