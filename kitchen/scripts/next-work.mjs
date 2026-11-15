import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parse as parseBlocker } from "./blocked.mjs";
import { TICKET_WINDOW_MINUTES, WINDOW_MINUTES } from "./claims.mjs";
import { load } from "./kitchen.mjs";

export const QUEUES = ["unblock", "drive", "ticket"];
export const LANE = "--- DO NOT MERGE — TEST:";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SELF = ".claude/kitchen/scripts/next-work.mjs";

// A pending status that old is a check that never reports, not CI still running on a push.
const CI_RUNNING_MINUTES = 30;
const AUDIT_AFTER_DAYS = 3;
const DEAD_CLAIM_MINUTES = 24 * 60;

const GROUPS = ["mergeable", "conflicted", "unfinished"];
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)\b/gi;
const TITLE_SCOPE = /^\S+ \w+\(#(\d+)\):/u;
const BLOCKED_BY_SECTION = /^##\s+Blocked by\s*$([\s\S]*?)(?=^#{1,2}\s|(?![\s\S]))/im;
const BLOCKED_BY_LINE = /^\**Blocked by\**:\**\s*(.+)$/gim;
const DEPENDS_ON = /^Depends on:\s*(.+)$/im;
const LOCAL_REF = /(?<![\w/.-])#(\d+)\b/g;
const BLOCKER_TITLE = /^🧱 ([a-z]+:[a-z0-9-]+)/u;
const LANDED = /^\S+ (?!wip)\w+\(#(\d+)\):/u;

const labelsOf = (item) => (item.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
const has = (item, label) => labelsOf(item).includes(label);
const refs = (text) => [...String(text ?? "").matchAll(LOCAL_REF)].map((match) => Number(match[1]));
const time = (item) => Date.parse(item.created_at ?? 0);
const minutesSince = (at, now) => (Date.parse(now) - Date.parse(at ?? 0)) / 60_000;
const age = (item, now) => Math.floor(minutesSince(item.created_at, now) / (24 * 60));

export function closesOf(pr) {
  const fromBody = [...String(pr.body ?? "").matchAll(CLOSING)].map((match) => Number(match[1]));
  const scope = TITLE_SCOPE.exec(pr.title ?? "");
  return [...new Set([...fromBody, ...(scope ? [Number(scope[1])] : [])])];
}

export function blockedByOf(body) {
  const text = String(body ?? "").replaceAll("\r", "");
  const section = BLOCKED_BY_SECTION.exec(text)?.[1] ?? "";
  const lines = [...text.matchAll(BLOCKED_BY_LINE)].map((match) => match[1]);
  return [...new Set([...refs(section), ...lines.flatMap(refs)])];
}

export const dependsOnOf = (body) => refs(DEPENDS_ON.exec(String(body ?? ""))?.[1]);

export function blocksOf(issue) {
  const parsed = parseBlocker(issue.body);
  if (parsed?.blocks.length) return parsed.blocks;
  return [...String(issue.body ?? "").matchAll(/^- \*\*Blocks\*\* · (.+)$/gm)].flatMap((match) => refs(match[1]));
}

export const landedOf = (subjects) =>
  new Set(subjects.map((subject) => LANDED.exec(subject)?.[1]).filter(Boolean).map(Number));

// A claim is a label, kept alive by edits to its comment: each edit moves the item's updated_at.
export function claimed(item, state, window = WINDOW_MINUTES) {
  return has(item, state.kitchen.labels.claimed) && minutesSince(item.updated_at, state.now) <= window;
}

const byPriority = (urgent) => (a, b) =>
  Number(has(b, urgent)) - Number(has(a, urgent)) || time(a) - time(b) || a.number - b.number;

function blockerIssues(state) {
  return [...state.issues, ...state.closedBlockers]
    .filter((issue) => has(issue, state.kitchen.labels.blocked) && BLOCKER_TITLE.test(issue.title ?? ""))
    .map((issue) => ({
      ...issue,
      key: BLOCKER_TITLE.exec(issue.title)[1],
      blocks: blocksOf(issue),
      open: issue.state !== "closed",
    }));
}

function unblock(state) {
  const { labels } = state.kitchen;
  const openPrs = new Set(state.prs.map((pr) => pr.number));
  const blockers = blockerIssues(state);
  const latest = (issue) => Date.parse(issue.closed_at ?? issue.updated_at ?? 0);

  const jobs = new Map();
  const orphan = [];
  let depending = 0;
  for (const pr of state.prs.filter((pr) => has(pr, labels.blocked))) {
    const naming = blockers.filter((issue) => issue.blocks.includes(pr.number));
    const open = naming.filter((issue) => issue.open);
    const chosen = open.length > 0 ? open : naming.sort((a, b) => latest(b) - latest(a)).slice(0, 1);
    if (chosen.length === 0) {
      if (dependsOnOf(pr.body).some((number) => openPrs.has(number))) depending += 1;
      else orphan.push({ pr: pr.number });
    }
    for (const issue of chosen) {
      if (!jobs.has(issue.number)) jobs.set(issue.number, { issue, prs: [] });
      jobs.get(issue.number).prs.push(pr.number);
    }
  }

  const stale = blockers
    .filter((issue) => issue.open && !has(issue, labels.needsHuman) && !jobs.has(issue.number) && !issue.blocks.some((n) => openPrs.has(n)))
    .map((issue) => ({ issue: issue.number, key: issue.key, prs: issue.blocks }));

  const buckets = { fix: [], resume: [], orphan, stale, wait: [], taken: [] };
  for (const { issue, prs } of [...jobs.values()].sort((a, b) => a.issue.number - b.issue.number)) {
    const job = { issue: issue.number, key: issue.key, prs: prs.sort((a, b) => a - b) };
    if (!issue.open) buckets.resume.push(job);
    else if (has(issue, labels.needsHuman)) buckets.wait.push(job);
    else if (claimed(issue, state)) buckets.taken.push(job);
    else buckets.fix.push(job);
  }
  const work = ["fix", "resume", "orphan", "stale"].some((bucket) => buckets[bucket].length > 0);
  if (work) return { pick: { queue: "unblock", ...buckets } };
  if (jobs.size === 0 && depending === 0) return { none: "nothing blocked" };
  return { none: "all waiting on humans or claimed" };
}

function groupOf(pr, state) {
  const { labels } = state.kitchen;
  const conflicted = state.conflicts.get(pr.number);
  if (conflicted === true) return "conflicted";
  if (has(pr, labels.autoMerge)) {
    const ciRunning = state.pending.has(pr.number) && minutesSince(pr.updated_at, state.now) < CI_RUNNING_MINUTES;
    return ciRunning ? null : "mergeable";
  }
  return has(pr, labels.readyForHuman) ? null : "unfinished";
}

function drive(state) {
  const { labels } = state.kitchen;
  const skip = new Set(state.skip ?? []);
  const openIssues = new Map(state.issues.map((issue) => [issue.number, issue]));
  const ticketClaimed = (pr) =>
    closesOf(pr).some((number) => openIssues.has(number) && claimed(openIssues.get(number), state, TICKET_WINDOW_MINUTES));

  const ordered = state.prs
    .filter((pr) => !(pr.title ?? "").startsWith(LANE) && !has(pr, labels.blocked) && !skip.has(pr.number))
    .filter((pr) => !claimed(pr, state) && !ticketClaimed(pr))
    .map((pr) => ({ pr, group: groupOf(pr, state) }))
    .filter((entry) => entry.group)
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || byPriority(labels.urgent)(a.pr, b.pr));

  if (ordered.length === 0) return { none: "no PR to drive" };
  return { pick: { queue: "drive", pr: ordered[0].pr.number, group: ordered[0].group } };
}

function ticketFilter(state) {
  const { labels } = state.kitchen;
  const excluded = [
    labels.needsTriage,
    labels.needsInfo,
    labels.readyForHuman,
    labels.needsHuman,
    labels.wontfix,
    labels.blocked,
    labels.decision,
  ];
  const openItems = new Set([...state.issues, ...state.prs].map((item) => item.number));
  const named = new Set(state.prs.flatMap(closesOf));
  return (issue) => {
    if (excluded.some((label) => has(issue, label))) return "label";
    if ((issue.title ?? "").startsWith("⚖️ decision:")) return "decision";
    const subs = issue.sub_issues_summary ?? { total: 0, completed: 0 };
    if (subs.total > subs.completed) return "open sub-issues";
    if (subs.total > 0) return "every sub-issue closed";
    if (named.has(issue.number)) return "named by an open PR";
    if (state.landed.has(issue.number)) return "landed on the base branch";
    if ((issue.issue_dependencies_summary?.blocked_by ?? 0) > 0) return "blocked";
    if (blockedByOf(issue.body).some((number) => openItems.has(number))) return "blocked";
    if (claimed(issue, state, TICKET_WINDOW_MINUTES)) return "claimed";
    return null;
  };
}

function ticket(state) {
  const { labels } = state.kitchen;
  const excludedFor = ticketFilter(state);
  const namedUnder = new Map();
  for (const issue of state.issues)
    for (const number of blockedByOf(issue.body)) namedUnder.set(number, (namedUnder.get(number) ?? 0) + 1);
  const blocking = (issue) =>
    Math.max(namedUnder.get(issue.number) ?? 0, issue.issue_dependencies_summary?.blocking ?? 0);
  const urgent = (issue) => Number(has(issue, labels.urgent));

  const skip = new Set(state.skip ?? []);
  const [top] = state.issues
    .filter((issue) => excludedFor(issue) === null && !skip.has(issue.number))
    .sort((a, b) => urgent(b) - urgent(a) || blocking(b) - blocking(a) || a.number - b.number);
  return top ? { pick: { queue: "ticket", issue: top.number } } : { none: "backlog empty" };
}

const RUN = { unblock, drive, ticket };

export function held(state) {
  const { labels } = state.kitchen;
  const parts = [];
  for (const [label, items] of [
    [labels.readyForHuman, state.prs.filter((pr) => has(pr, labels.readyForHuman))],
    [labels.needsHuman, state.issues.filter((issue) => has(issue, labels.needsHuman))],
  ]) {
    if (items.length === 0) continue;
    const first = [...items].sort((a, b) => time(a) - time(b))[0];
    parts.push(`${items.length} ${label} (oldest #${first.number}, ${age(first, state.now)}d)`);
  }
  const excludedFor = ticketFilter(state);
  const done = state.issues.filter((issue) => ["landed on the base branch", "every sub-issue closed"].includes(excludedFor(issue)));
  if (done.length > 0) parts.push(`${done.length} open but done — run audit`);
  return parts.join(", ");
}

export function audit(state) {
  const { labels } = state.kitchen;
  const old = (item) => age(item, state.now) >= AUDIT_AFTER_DAYS;
  const excludedFor = ticketFilter(state);
  const openPrs = new Set(state.prs.map((pr) => pr.number));
  const items = [...state.issues, ...state.prs];
  const rows = [
    ["landed on the base branch, still open — close it", state.issues.filter((i) => excludedFor(i) === "landed on the base branch")],
    ["every sub-issue closed — close it", state.issues.filter((i) => excludedFor(i) === "every sub-issue closed")],
    ["🧱 issue blocking no open PR — close it", blockerIssues(state).filter((i) => i.open && !i.blocks.some((n) => openPrs.has(n)))],
    [`${labels.claimed} left by a run that died — take it off`, items.filter((i) => has(i, labels.claimed) && minutesSince(i.updated_at, state.now) > DEAD_CLAIM_MINUTES)],
    ["decision with no person asked", state.issues.filter((i) => (i.title ?? "").startsWith("⚖️ decision:") && !has(i, labels.needsHuman) && !has(i, labels.readyForHuman))],
    [`${labels.needsTriage} or ${labels.needsInfo}, ${AUDIT_AFTER_DAYS}+ days`, state.issues.filter((i) => (has(i, labels.needsTriage) || has(i, labels.needsInfo)) && old(i))],
    [`${labels.needsHuman}, ${AUDIT_AFTER_DAYS}+ days`, state.issues.filter((i) => has(i, labels.needsHuman) && old(i))],
    [`${labels.readyForHuman} issue, ${AUDIT_AFTER_DAYS}+ days`, state.issues.filter((i) => has(i, labels.readyForHuman) && old(i))],
    [`${labels.readyForHuman} PR, ${AUDIT_AFTER_DAYS}+ days`, state.prs.filter((p) => has(p, labels.readyForHuman) && old(p))],
    ["ticket whose PR was closed unmerged — rebuild, relabel or close", state.issues.filter((i) => excludedFor(i) === null && state.closedUnmergedPrs.some((pr) => closesOf(pr).includes(i.number)))],
  ];
  const lines = rows
    .filter(([, found]) => found.length > 0)
    .map(([what, found]) => `${what} · ${found.map((item) => `#${item.number}`).join(" ")}`);
  return lines.length > 0 ? lines.join("\n") : "none · nothing held";
}

export function decide(state, queues = QUEUES) {
  const nones = [];
  for (const queue of queues) {
    const result = RUN[queue](state);
    if (result.pick) return { pick: result.pick };
    nones.push(result.none);
  }
  const none = queues.length === QUEUES.length ? "nothing to do" : nones.join(" · ");
  return { none, held: held(state) };
}

const list = (numbers) => numbers.map((n) => `#${n}`).join(" ");
const job = ({ issue, key, prs }) => `#${issue} ${key} → ${list(prs)}`;
const UNBLOCK_BUCKETS = ["fix", "resume", "orphan", "stale", "wait", "taken"];

export function format(result) {
  const { pick } = result;
  if (!pick) return `none · ${result.none}${result.held ? ` · held: ${result.held}` : ""}`;
  if (pick.queue === "drive") return `drive · #${pick.pr} · ${pick.group}`;
  if (pick.queue === "ticket") return `ticket · #${pick.issue}`;
  const parts = UNBLOCK_BUCKETS.filter((bucket) => pick[bucket].length > 0).map((bucket) =>
    bucket === "orphan" ? `orphan ${list(pick.orphan.map(({ pr }) => pr))}` : `${bucket} ${pick[bucket].map(job).join(", ")}`,
  );
  return `unblock · ${parts.join(" · ")}`;
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function searchPage(args) {
  let failure;
  for (const wait of [0, 2_000, 5_000, 15_000]) {
    if (wait) pause(wait);
    try {
      const result = JSON.parse(
        execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }),
      );
      if (!Array.isArray(result.items)) throw new Error(result.message ?? "search returned no items list");
      if (result.incomplete_results) throw new Error("search timed out and returned incomplete results");
      return result;
    } catch (error) {
      failure = error;
    }
  }
  throw new Error(`GitHub search failed: ${String(failure.stderr || failure.message).trim().split("\n")[0]}`);
}

function search(query, { pages = 10 } = {}) {
  const items = new Map();
  for (let page = 1; page <= pages; page++) {
    const result = searchPage([
      "api", "-X", "GET", "search/issues",
      "-f", `q=${query}`, "-f", "per_page=100", "-f", `page=${page}`, "-f", "sort=created", "-f", "order=asc",
    ]);
    for (const item of result.items) items.set(item.number, item);
    if (result.items.length < 100 || items.size >= result.total_count) break;
  }
  return [...items.values()];
}

const BASE = "refs/next-work/base";
const headRef = (number) => `refs/next-work/pr-${number}`;

function fetchRefs(git, baseBranch, numbers) {
  const spec = (number) => `+refs/pull/${number}/head:${headRef(number)}`;
  try {
    git(["fetch", "-q", "--no-tags", "origin", `+refs/heads/${baseBranch}:${BASE}`, ...numbers.map(spec)]);
    return new Set(numbers);
  } catch {}
  try {
    git(["fetch", "-q", "--no-tags", "origin", `+refs/heads/${baseBranch}:${BASE}`]);
  } catch (error) {
    throw new Error(`git could not fetch ${baseBranch}: ${String(error.stderr || error.message).trim().split("\n")[0]}`);
  }
  const fetched = new Set();
  for (const number of numbers) {
    try {
      git(["fetch", "-q", "--no-tags", "origin", spec(number)]);
      fetched.add(number);
    } catch {}
  }
  return fetched;
}

export function inspect(numbers, baseBranch, cwd = ROOT) {
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const conflicts = new Map();
  let landed = new Set();
  let failure;
  try {
    const fetched = fetchRefs(git, baseBranch, numbers);
    landed = landedOf(git(["log", "--format=%s", "-n", "2000", BASE]).split("\n"));
    const mergeTree = (number) => {
      try {
        git(["merge-tree", "--write-tree", "--no-messages", BASE, headRef(number)]);
        return false;
      } catch (error) {
        return error.status === 1 ? true : undefined;
      }
    };
    const undecided = [];
    for (const number of fetched) {
      const result = mergeTree(number);
      if (result === undefined) undecided.push(number);
      else conflicts.set(number, result);
    }
    if (undecided.length > 0) {
      try {
        git(["fetch", "-q", "--no-tags", "--deepen=500", "origin", `+refs/heads/${baseBranch}:${BASE}`, ...undecided.map((n) => `+refs/pull/${n}/head:${headRef(n)}`)]);
        for (const number of undecided) {
          const result = mergeTree(number);
          if (result !== undefined) conflicts.set(number, result);
        }
      } catch {}
    }
  } catch (error) {
    failure = error;
  }
  for (const name of [BASE, ...numbers.map(headRef)]) {
    try {
      git(["update-ref", "-d", name]);
    } catch {}
  }
  if (failure) throw failure;
  const unknown = numbers.filter((number) => !conflicts.has(number));
  if (unknown.length > 0) process.stderr.write(`next-work: could not check ${list(unknown)} for conflicts\n`);
  return { conflicts, landed };
}

export function gather(kitchen, { now = new Date(), skip = [], auditing = false } = {}) {
  const repo = `repo:${kitchen.repo}`;
  const prs = search(`${repo} is:pr is:open`);
  const issues = search(`${repo} is:issue is:open`);
  const closedBlockers = search(`${repo} is:issue is:closed label:"${kitchen.labels.blocked}"`, { pages: 5 });
  const pending = new Set(search(`${repo} is:pr is:open label:"${kitchen.labels.autoMerge}" status:pending`, { pages: 1 }).map((pr) => pr.number));
  const closedUnmergedPrs = auditing ? search(`${repo} is:pr is:closed is:unmerged`, { pages: 3 }) : [];
  const candidates = prs.filter((pr) => !(pr.title ?? "").startsWith(LANE) && !has(pr, kitchen.labels.blocked));
  const { conflicts, landed } = inspect(candidates.map((pr) => pr.number), kitchen.baseBranch);
  return {
    kitchen,
    prs,
    issues,
    closedBlockers,
    closedUnmergedPrs,
    pending,
    conflicts,
    landed,
    skip,
    now: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

const USAGE = [`node ${SELF} [${QUEUES.join("|")} ...] [--skip <pr or issue> ...]`, `node ${SELF} audit`].join("\n");

export function parseArgs(args) {
  const skipAt = args.indexOf("--skip");
  const skip = skipAt === -1 ? [] : args.slice(skipAt + 1).filter((arg) => arg !== "--skip").map(Number);
  const named = skipAt === -1 ? args : args.slice(0, skipAt);
  const queues = named.length > 0 ? named : QUEUES;
  if (queues.some((queue) => !QUEUES.includes(queue)) || skip.some((n) => !Number.isInteger(n))) return null;
  return { queues, skip };
}

function main(args) {
  if (args[0] === "audit") return audit(gather(load(), { auditing: true }));
  const parsed = parseArgs(args);
  if (!parsed) {
    process.stderr.write(`usage:\n${USAGE}\n`);
    process.exit(2);
  }
  return format(decide(gather(load(), { skip: parsed.skip }), parsed.queues));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (error) {
    console.log(`error · ${String(error.message).split("\n")[0]}`);
    process.exit(1);
  }
}
