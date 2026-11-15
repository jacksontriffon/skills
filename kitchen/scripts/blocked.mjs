import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { load } from "./kitchen.mjs";

export const HEADER = "🧱 **Blocked**";

const KEY = /^[a-z]+:[a-z0-9-]+$/;
const HEAD = /^🧱 \*\*Blocked\*\* · `([^`]+)`\s*$/m;
const BULLET = /^- \*\*(.+?)\*\* · (.+)$/gm;

const FIELDS = [
  ["stopped", "Stopped at"],
  ["error", "Error"],
  ["tried", "Tried"],
  ["next", "Next"],
  ["issue", "Issue"],
  ["blocks", "Blocks"],
  ["human", "Human"],
];

const numbers = (text) => [...String(text).matchAll(/#(\d+)/g)].map((match) => Number(match[1]));

export function title(key) {
  if (!KEY.test(key ?? "")) throw new Error(`a key reads area:slug, not "${key}"`);
  return `🧱 ${key}`;
}

export function format({ key, stopped, error, tried, next, issue, blocks, human }) {
  if (!KEY.test(key ?? "")) throw new Error(`a key reads area:slug, not "${key}"`);
  if (!stopped) throw new Error("a blocker names the step it stopped at");
  if (!next) throw new Error("a blocker names the next thing to do");
  const values = { stopped, error, tried, next, issue, blocks, human };
  const lines = FIELDS.filter(([field]) => values[field]).map(
    ([field, label]) => `- **${label}** · ${values[field]}`,
  );
  return [`${HEADER} · \`${key}\``, "", ...lines, ""].join("\n");
}

export function parse(text) {
  const source = String(text ?? "");
  const head = HEAD.exec(source);
  if (!head || !KEY.test(head[1])) return null;

  const byLabel = Object.fromEntries(
    [...source.matchAll(BULLET)].map((match) => [match[1], match[2].trim()]),
  );
  const result = { key: head[1], area: head[1].split(":")[0] };
  for (const [field, label] of FIELDS) result[field] = byLabel[label] ?? "";
  if (!result.stopped || !result.next) return null;

  result.issue = numbers(result.issue)[0] ?? null;
  result.blocks = numbers(result.blocks);
  result.human = numbers(result.human)[0] ?? null;
  return result;
}

export function owner(key, humans) {
  const area = String(key).split(":")[0];
  return `@${humans.areas?.[area] ?? humans.default}`;
}

export function readHumans() {
  return load().humans;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  if (command === "parse") {
    const parsed = parse(readFileSync(0, "utf8"));
    if (!parsed) {
      process.stderr.write("not a blocker comment\n");
      process.exit(1);
    }
    console.log(JSON.stringify(parsed));
  } else if (command === "format") {
    process.stdout.write(format(JSON.parse(readFileSync(0, "utf8"))));
  } else if (command === "title" && arg) {
    console.log(title(arg));
  } else if (command === "owner" && arg) {
    console.log(owner(arg, readHumans()));
  } else {
    process.stderr.write(
      "usage: blocked.mjs parse < comment.md · blocked.mjs format < blocker.json · blocked.mjs title <area:slug> · blocked.mjs owner <area:slug>\n",
    );
    process.exit(2);
  }
}
