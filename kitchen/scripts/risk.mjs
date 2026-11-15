import { fileURLToPath } from "node:url";

import { escapeRegExp, load, trusted as trustedHandles } from "./kitchen.mjs";
import { isNativeChange } from "./is-native-change.mjs";
import { isSkippablePath } from "./is-skippable-change.mjs";

export const TIERS = ["low", "medium", "high"];

export const LABELS = {
  low: "risk:low",
  medium: "risk:medium",
  high: "risk:high",
  autoMerge: "auto-merge",
};

const FIXED = [
  {
    tier: "high",
    reason: "the merge gate",
    globs: [
      ".claude/kitchen/scripts/risk.mjs",
      ".claude/kitchen/scripts/kitchen.mjs",
      ".claude/kitchen.json",
      ".claude/skills/drive-pr-green/**",
    ],
  },
  { tier: "high", reason: "CI workflow", globs: [".github/workflows/**"] },
  { tier: "medium", reason: "dependencies", globs: ["pnpm-lock.yaml"] },
  { tier: "medium", reason: "agent instructions", globs: [".claude/**"] },
];

const GLOBS = new Map();

function globPattern(glob) {
  if (!GLOBS.has(glob)) {
    const source = glob
      .split("**")
      .map((part) => part.split("*").map(escapeRegExp).join("[^/]*"))
      .join(".*");
    GLOBS.set(glob, new RegExp(`^${source}$`));
  }
  return GLOBS.get(glob);
}

const matches = (glob, path) => globPattern(glob).test(path);

const rank = (tier) => TIERS.indexOf(tier);

export const higher = (a, b) => (rank(a) >= rank(b) ? a : b);

export function floor(changes, risk) {
  if (!risk) throw new Error("floor needs the kitchen's risk config: without it every configured floor is dropped");
  const rules = [
    ...FIXED.filter(({ tier }) => tier === "high"),
    ...risk.high.map((glob) => ({ tier: "high", reason: glob, globs: [glob] })),
    { tier: "medium", reason: "native build", test: (path) => isNativeChange(path) },
    ...FIXED.filter(({ tier }) => tier === "medium"),
    ...risk.medium.map((glob) => ({ tier: "medium", reason: glob, globs: [glob] })),
  ];
  let tier = "low";
  const reasons = [];
  for (const rule of rules) {
    const test = rule.test ?? ((path) => rule.globs.some((glob) => matches(glob, path)));
    if (!changes.some(({ path }) => test(path))) continue;
    tier = higher(tier, rule.tier);
    reasons.push(rule.reason);
  }
  const lines = changes
    .filter(({ path }) => !isSkippablePath(path))
    .reduce((sum, { added = 0, deleted = 0 }) => sum + added + deleted, 0);
  if (lines > risk.largeDiffLines) {
    tier = higher(tier, "medium");
    reasons.push(`${lines} lines`);
  }
  return { tier, reasons };
}

export function parseNumstat(text) {
  return String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, ...path] = line.split("\t");
      return {
        path: path.join("\t"),
        added: Number(added) || 0,
        deleted: Number(deleted) || 0,
      };
    });
}

const COMMENT = /^\S*\s*\*\*Risk\*\* · (low|medium|high) · ([0-9a-f]{40})\s*$/;

export function heading({ tier, sha }) {
  if (!TIERS.includes(tier)) throw new Error(`unknown tier: ${tier}`);
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("a risk verdict names the full head SHA");
  return `🎚️ **Risk** · ${tier} · ${sha}`;
}

export function parse(body) {
  const first = String(body ?? "").trim().split("\n")[0]?.trim() ?? "";
  const match = COMMENT.exec(first);
  return match ? { tier: match[1], sha: match[2] } : null;
}

const WHO = { low: "merges on green", medium: "a person merges", high: "a person merges" };

export function formatReceipt({ tier, reason = "", url }) {
  if (!url) throw new Error("a receipt names where its detail was posted");
  if (tier === "blocked") {
    if (!reason) throw new Error("a blocked receipt names its reason");
    return `blocked · ${reason} · ${url}`;
  }
  if (!TIERS.includes(tier)) throw new Error(`unknown tier: ${tier}`);
  return `${tier} · ${WHO[tier]} · ${url}`;
}

export function parseReceipt(text) {
  const line = String(text ?? "").trim().split("\n").at(-1)?.trim() ?? "";
  const [tier, middle, url, ...rest] = line.split("·").map((part) => part.trim());
  if (rest.length > 0 || !url || !/^https:\/\/\S+$/.test(url)) return null;
  if (tier === "blocked") return middle ? { tier, reason: middle, url } : null;
  if (!TIERS.includes(tier) || middle !== WHO[tier]) return null;
  return { tier, reason: "", url };
}

const HANDED_OVER = [LABELS.autoMerge, "ready-for-human"];

export function relabel(current, tier) {
  const owned = new Set([...Object.values(LABELS), ...HANDED_OVER]);
  const kept = current.filter((label) => !owned.has(label));
  const handedOver = current.some((label) => HANDED_OVER.includes(label));
  const handOver = tier === "low" ? LABELS.autoMerge : "ready-for-human";
  return [...kept, LABELS[tier], ...(handedOver ? [handOver] : [])];
}

const CLOSES = /^Closes #(\d+)\s*$/im;

export function ticketNumber(body) {
  const match = CLOSES.exec(String(body ?? ""));
  return match ? Number(match[1]) : null;
}

const OPEN_FINDINGS = /^\|.*\b(?:[1-9]\d*) open\b|^\|.*\|\s*blocked · /m;

export function fromGitHub({ pr, comments = [], ticket = null }, changes) {
  const body = pr.body ?? "";
  return {
    pr: {
      headSha: pr.head?.sha ?? "",
      headRepo: pr.head?.repo?.full_name ?? "",
      baseRepo: pr.base?.repo?.full_name ?? "",
      author: pr.user?.login ?? "",
      labels: (pr.labels ?? []).map((label) => label?.name ?? label),
      body,
    },
    changes,
    comments: comments.map((comment) => ({
      author: comment.user?.login,
      body: comment.body ?? "",
    })),
    ticketAuthor:
      ticket && ticket.number === ticketNumber(body) ? (ticket.user?.login ?? null) : null,
  };
}

export function gate({
  pr,
  changes,
  comments = [],
  trusted = [],
  ticketAuthor = null,
  risk,
}) {
  const no = (description) => ({ merge: false, description });
  const sha = pr.headSha;
  const short = sha.slice(0, 7);

  if (pr.headRepo !== pr.baseRepo) return no("from a fork · a person merges");
  if (!trusted.includes(pr.author)) return no(`${pr.author} is not trusted · a person merges`);
  if (pr.labels.includes("blocked")) return no("blocked · a person merges");

  const paths = floor(changes, risk);
  if (paths.tier !== "low")
    return no(`${paths.tier} by path · ${paths.reasons.join(" · ")} · a person merges`);

  if (ticketNumber(pr.body) === null) return no("no Closes line · a person merges");
  if (!trusted.includes(ticketAuthor))
    return no("ticket not from a trusted author · a person merges");
  if (OPEN_FINDINGS.test(pr.body ?? "")) return no("a check is open or blocked · a person merges");

  const verdict = comments
    .filter((comment) => trusted.includes(comment.author))
    .map((comment) => parse(comment.body))
    .filter((parsed) => parsed?.sha === sha)
    .at(-1);
  if (!verdict) return no(`no risk review on ${short} · a person merges`);
  if (verdict.tier !== "low") return no(`${verdict.tier} on ${short} · a person merges`);

  return { merge: true, description: `low on ${short} · merges` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { readFileSync } = await import("node:fs");
  const [command, ...args] = process.argv.slice(2);

  if (command === "floor") {
    const { tier, reasons } = floor(parseNumstat(readFileSync(0, "utf8")), load().risk);
    console.log([tier, ...reasons].join(" · "));
  } else if (command === "heading") {
    console.log(heading({ tier: args[0], sha: args[1] }));
  } else if (command === "parse") {
    const parsed = parse(readFileSync(0, "utf8"));
    if (!parsed) process.exit(1);
    console.log(`${parsed.tier} · ${parsed.sha}`);
  } else if (command === "gate") {
    const kitchen = load();
    const trusted = trustedHandles(kitchen);
    const changes = parseNumstat(readFileSync(args[0], "utf8"));
    const input = fromGitHub(JSON.parse(readFileSync(0, "utf8")), changes);
    const verdict = gate({ ...input, trusted, risk: kitchen.risk });
    console.log(`${verdict.merge ? "merge" : "hold"} · ${verdict.description}`);
  } else if (command === "labels") {
    const [tier, ...current] = args;
    if (!TIERS.includes(tier)) process.exit(2);
    for (const label of relabel(current, tier)) console.log(label);
  } else {
    process.stderr.write(
      [
        "usage:",
        "  git diff --numstat origin/main...HEAD | risk.mjs floor",
        "  risk.mjs heading <tier> <head-sha>",
        "  risk.mjs parse <comment.md",
        "  risk.mjs labels <tier> [current-label...]",
        "  risk.mjs gate <numstat-file> <pr.json",
        "",
      ].join("\n"),
    );
    process.exit(2);
  }
}
