import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { format as blocker } from "./blocked.mjs";
import { load } from "./kitchen.mjs";
import {
  LANE,
  audit,
  blockedByOf,
  blocksOf,
  claimed,
  closesOf,
  decide,
  dependsOnOf,
  format,
  inspect,
  landedOf,
  parseArgs,
} from "./next-work.mjs";

const kitchen = load();
const L = kitchen.labels;
const NOW = "2026-11-08T04:00:00Z";
const ago = (minutes) => new Date(Date.parse(NOW) - minutes * 60_000).toISOString().replace(".000Z", "Z");
const DAY = 24 * 60;

const item = (number, { labels = [], title, body = "", age = 1000, touched = age, state = "open", ...rest } = {}) => ({
  number,
  title,
  body,
  labels: labels.map((name) => ({ name })),
  state,
  created_at: ago(age),
  updated_at: ago(touched),
  ...rest,
});
const pr = (number, options = {}) => item(number, { title: `✨ feat: x ${number}`, age: number, ...options });
const issue = (number, options = {}) => item(number, { title: `✨ feat: ${number}`, ...options });

const blockerIssue = (number, blocks, { labels = [], ...options } = {}) =>
  issue(number, {
    title: `🧱 code:thing-${number}`,
    body: blocker({ key: `code:thing-${number}`, stopped: "evidence", next: "fix it", blocks: blocks.map((n) => `#${n}`).join(" ") }),
    ...options,
    labels: [L.blocked, ...labels],
  });

const state = ({ prs = [], issues = [], closedBlockers = [], closedUnmergedPrs = [], pending = [], conflicts, landed = [], skip = [] } = {}) => ({
  kitchen,
  prs,
  issues,
  closedBlockers,
  closedUnmergedPrs,
  pending: new Set(pending),
  conflicts: new Map(Object.entries(conflicts ?? Object.fromEntries(prs.map((p) => [p.number, false]))).map(([n, v]) => [Number(n), v])),
  landed: new Set(landed),
  skip,
  now: NOW,
});

describe("claimed", () => {
  const given = state();

  it("is the claimed label on an item touched inside the window", () => {
    assert.equal(claimed(issue(1, { labels: [L.claimed], touched: 30 }), given), true);
    assert.equal(claimed(issue(1, { touched: 30 }), given), false);
  });

  it("expires when the run stops touching the item, so a run that died frees it", () => {
    assert.equal(claimed(issue(1, { labels: [L.claimed], touched: 91 }), given), false);
    assert.equal(claimed(issue(1, { labels: [L.claimed], touched: 150 }), given, 180), true);
  });
});

describe("closesOf", () => {
  it("reads every closing keyword GitHub honours", () =>
    assert.deepEqual(closesOf({ body: "Closes #69\nfixes #70 and Resolved #71\nCloses: #73\nsee #72" }), [69, 70, 71, 73]));

  it("reads the issue a conventional title scopes, for a PR whose body forgot its Closes line", () =>
    assert.deepEqual(closesOf({ title: "🐛 fix(#1056): the camera stage", body: "" }), [1056]));
});

describe("blockedByOf", () => {
  it("reads the numbers under `## Blocked by` and stops at the next heading", () =>
    assert.deepEqual(blockedByOf("Intro #1\n\n## Blocked by\n\n- #12\n- #13 (the API)\n\n## Notes\n\n#14"), [12, 13]));

  it("reads an inline `Blocked by:` line", () => assert.deepEqual(blockedByOf("Parked.\nBlocked by: #680."), [680]));

  it("skips a ref to another repository", () => assert.deepEqual(blockedByOf("## Blocked by\n- other/repo#5\n- #6"), [6]));

  it("reads to the end when the section is last", () => assert.deepEqual(blockedByOf("## Blocked by\r\n- #5\r\n"), [5]));
});

describe("blocksOf, dependsOnOf and landedOf", () => {
  it("reads the Blocks bullet of a formatted blocker", () => assert.deepEqual(blocksOf(blockerIssue(600, [431, 440])), [431, 440]));

  it("reads a Blocks bullet a person edited out of shape", () =>
    assert.deepEqual(blocksOf({ body: "🧱 something\n- **Blocks** · #9, #10" }), [9, 10]));

  it("reads a Depends on line", () => assert.deepEqual(dependsOnOf("x\nDepends on: #4, #5\n"), [4, 5]));

  it("reads the issue every finished commit names, and skips work in progress", () =>
    assert.deepEqual([...landedOf(["💄 ui(#1056): x", "🚧 wip(#858): red", "Merge pull request #1069", "✨ feat(#784): y"])], [1056, 784]));
});

describe("unblock", () => {
  const run = (given) => decide(state(given), ["unblock"]);
  const blockedPr = (n, options = {}) => pr(n, { labels: [L.blocked], ...options });
  const empty = { fix: [], resume: [], orphan: [], stale: [], wait: [], taken: [] };

  it("is none when nothing is blocked", () => assert.equal(run({ prs: [pr(1)] }).none, "nothing blocked"));

  it("names a blocked PR no 🧱 issue names as an orphan, so it is filed rather than lost", () =>
    assert.deepEqual(run({ prs: [blockedPr(1)] }).pick, { queue: "unblock", ...empty, orphan: [{ pr: 1 }] }));

  it("leaves a blocked PR alone while the PR it depends on is open", () =>
    assert.equal(run({ prs: [blockedPr(1, { body: "Depends on: #2" }), pr(2)] }).none, "all waiting on humans or claimed"));

  it("names a dependency-blocked PR an orphan once what it depends on has merged", () =>
    assert.deepEqual(run({ prs: [blockedPr(1, { body: "Depends on: #2" })] }).pick.orphan, [{ pr: 1 }]));

  it("waits on a blocker labelled for a human, and pings nobody", () =>
    assert.equal(run({ prs: [blockedPr(1)], issues: [blockerIssue(600, [1], { labels: [L.needsHuman] })] }).none, "all waiting on humans or claimed"));

  it("fixes an open blocker, grouping every PR it blocks", () =>
    assert.deepEqual(run({ prs: [blockedPr(1), blockedPr(2)], issues: [blockerIssue(600, [1, 2])] }).pick, {
      queue: "unblock",
      ...empty,
      fix: [{ issue: 600, key: "code:thing-600", prs: [1, 2] }],
    }));

  it("leaves a blocker another agent claimed, and fixes it once that claim goes quiet", () => {
    const held = (touched) => ({ prs: [blockedPr(1)], issues: [blockerIssue(600, [1], { labels: [L.claimed], touched })] });
    assert.equal(run(held(30)).none, "all waiting on humans or claimed");
    assert.equal(run(held(200)).pick.fix[0].issue, 600);
  });

  it("resumes a PR whose blocker was closed", () =>
    assert.deepEqual(
      run({ prs: [blockedPr(1)], closedBlockers: [blockerIssue(600, [1], { state: "closed", closed_at: ago(10) })] }).pick.resume,
      [{ issue: 600, key: "code:thing-600", prs: [1] }],
    ));

  it("takes the open blocker over a closed one that named the same PR earlier", () =>
    assert.equal(
      run({ prs: [blockedPr(1)], issues: [blockerIssue(601, [1])], closedBlockers: [blockerIssue(600, [1], { state: "closed", closed_at: ago(10) })] }).pick.fix[0].issue,
      601,
    ));

  it("reads a 🧱 title a person added words to", () =>
    assert.equal(run({ prs: [blockedPr(1)], issues: [blockerIssue(600, [1], { title: "🧱 code:thing-600 (nearly)" })] }).pick.fix[0].issue, 600));

  it("names an open 🧱 issue that blocks no open PR as stale, so it is closed", () =>
    assert.deepEqual(run({ issues: [blockerIssue(931, [929])] }).pick.stale, [{ issue: 931, key: "code:thing-931", prs: [929] }]));

  it("leaves a stale 🧱 issue that asks a person something to the audit, never closing their ask", () =>
    assert.equal(run({ issues: [blockerIssue(1000, [999], { labels: [L.needsHuman] })] }).none, "nothing blocked"));

  it("names the issues waiting on a human or held by another agent beside the work, for the report", () =>
    assert.equal(
      format(
        run({
          prs: [1, 2, 3].map((n) => blockedPr(n)),
          issues: [blockerIssue(600, [1]), blockerIssue(601, [2], { labels: [L.needsHuman] }), blockerIssue(602, [3], { labels: [L.claimed], touched: 5 })],
        }),
      ),
      "unblock · fix #600 code:thing-600 → #1 · wait #601 code:thing-601 → #2 · taken #602 code:thing-602 → #3",
    ));
});

describe("drive", () => {
  const run = (given) => decide(state(given), ["drive"]);

  it("drops lanes, blocked PRs and handed-over PRs that do not conflict", () =>
    assert.equal(
      run({ prs: [pr(1, { title: `${LANE} lane 1` }), pr(2, { labels: [L.blocked] }), pr(3, { labels: [L.readyForHuman] })] }).none,
      "no PR to drive",
    ));

  it("takes a handed-over PR back when it conflicts with the base branch", () =>
    assert.deepEqual(run({ prs: [pr(3, { labels: [L.readyForHuman] })], conflicts: { 3: true } }).pick, { queue: "drive", pr: 3, group: "conflicted" }));

  it("sends an auto-merge PR to the merge step, unless CI is still running on a fresh push", () => {
    const autoMerge = (touched) => [pr(4, { labels: [L.autoMerge], touched })];
    assert.equal(run({ prs: autoMerge(5) }).pick.group, "mergeable");
    assert.equal(run({ prs: autoMerge(5), pending: [4] }).none, "no PR to drive");
    assert.equal(run({ prs: autoMerge(120), pending: [4] }).pick.group, "mergeable");
  });

  it("drives an unfinished PR git could not check, and leaves a handed-over one to its person", () =>
    assert.deepEqual(run({ prs: [pr(1, { labels: [L.readyForHuman] }), pr(2)], conflicts: {} }).pick, { queue: "drive", pr: 2, group: "unfinished" }));

  it("takes a mergeable auto-merge PR before a conflicted one, and a conflicted one before an unfinished one", () => {
    const prs = [pr(1, { age: 900 }), pr(2, { labels: [L.readyForHuman] }), pr(4, { labels: [L.autoMerge] })];
    assert.equal(run({ prs, conflicts: { 1: false, 2: true, 4: false } }).pick.pr, 4);
    assert.equal(run({ prs, conflicts: { 1: false, 2: true, 4: false }, pending: [4] }).pick.pr, 2);
  });

  it("orders inside a group urgent first, then oldest first", () => {
    assert.equal(run({ prs: [pr(1, { age: 10 }), pr(2, { age: 99 })] }).pick.pr, 2);
    assert.equal(run({ prs: [pr(1, { age: 10, labels: [L.urgent] }), pr(2, { age: 99 })] }).pick.pr, 1);
  });

  it("passes over a PR another session is driving", () =>
    assert.equal(run({ prs: [pr(1, { age: 99, labels: [L.claimed], touched: 20 }), pr(2, { age: 10 })] }).pick.pr, 2));

  it("passes over a PR whose ticket a /pick-up-ticket run claimed two hours ago", () =>
    assert.equal(
      run({ prs: [pr(1, { age: 99, body: "Closes #50" }), pr(2, { age: 10 })], issues: [issue(50, { labels: [L.claimed], touched: 120 })] }).pick.pr,
      2,
    ));

  it("skips the PRs it is told to, so a PR that ends without a receipt does not starve the rest", () =>
    assert.equal(run({ prs: [pr(1, { age: 99 }), pr(2, { age: 10 })], skip: [1] }).pick.pr, 2));
});

describe("ticket", () => {
  const run = (given) => decide(state(given), ["ticket"]);

  it("drops what pick-up-ticket drops by label, title, sub-issue, PR, blocker and claim", () =>
    assert.equal(
      run({
        prs: [pr(900, { body: "Closes #7" }), pr(901, { title: "🐛 fix(#12): y" })],
        issues: [
          ...[L.needsTriage, L.needsInfo, L.readyForHuman, L.needsHuman, L.wontfix, L.blocked, L.decision].map((label, index) => issue(index + 1, { labels: [label] })),
          issue(8, { title: "⚖️ decision: which" }),
          issue(9, { sub_issues_summary: { total: 2, completed: 1 } }),
          issue(7),
          issue(10, { body: "## Blocked by\n\n- #9" }),
          issue(11, { issue_dependencies_summary: { blocked_by: 1 } }),
          issue(12),
          issue(13, { body: "Blocked by: #901" }),
          issue(14, { labels: [L.claimed], touched: 150 }),
        ],
      }).none,
      "backlog empty",
    ));

  it("does not build an epic whose sub-issues are all closed: it is a container to close", () =>
    assert.equal(run({ issues: [issue(277, { sub_issues_summary: { total: 6, completed: 6 } })] }).none, "backlog empty"));

  it("does not rebuild a ticket whose work already landed on the base branch", () =>
    assert.equal(run({ issues: [issue(1053)], landed: [1053] }).none, "backlog empty"));

  it("keeps an issue whose blocker is closed, and one whose claim went quiet", () => {
    assert.equal(run({ issues: [issue(10, { body: "## Blocked by\n\n- #3" })] }).pick.issue, 10);
    assert.equal(run({ issues: [issue(14, { labels: [L.claimed], touched: 200 })] }).pick.issue, 14);
  });

  it("skips a ticket it is told to, so a session that lost its claim race takes the next one", () =>
    assert.equal(run({ issues: [issue(1), issue(2)], skip: [1] }).pick.issue, 2));

  it("ranks urgent first, then by how many open issues it blocks, then by number", () => {
    const issues = [
      issue(1),
      issue(2),
      issue(3),
      issue(20, { labels: [L.decision], body: "## Blocked by\n- #3" }),
      issue(21, { labels: [L.decision], body: "## Blocked by\n- #3\n- #2" }),
    ];
    assert.equal(run({ issues }).pick.issue, 3);
    assert.equal(run({ issues: [...issues, issue(4, { labels: [L.urgent] })] }).pick.issue, 4);
    assert.equal(run({ issues: [issue(1), issue(2, { issue_dependencies_summary: { blocking: 1 } })] }).pick.issue, 2);
  });
});

describe("decide", () => {
  const blocked = { prs: [pr(1, { labels: [L.blocked] }), pr(2)], issues: [blockerIssue(600, [1]), issue(3)] };

  it("takes the queues in order: unblock, then drive, then ticket", () => {
    assert.equal(decide(state(blocked)).pick.queue, "unblock");
    assert.equal(decide(state({ ...blocked, issues: [blockerIssue(600, [1], { labels: [L.needsHuman] }), issue(3)] })).pick.queue, "drive");
    assert.equal(decide(state({ issues: [issue(3)] })).pick.queue, "ticket");
  });

  it("runs only the queues it is given", () => assert.equal(decide(state(blocked), ["ticket"]).pick.issue, 3));

  it("says what is held on a person when there is nothing to do", () => {
    const given = state({ prs: [pr(5, { labels: [L.readyForHuman], age: 3 * DAY })], issues: [issue(8, { labels: [L.needsHuman], age: 10 * DAY })] });
    assert.equal(format(decide(given)), `none · nothing to do · held: 1 ${L.readyForHuman} (oldest #5, 3d), 1 ${L.needsHuman} (oldest #8, 10d)`);
    assert.equal(format(decide(state({ issues: [issue(1053)], landed: [1053] }))), "none · nothing to do · held: 1 open but done — run audit");
  });

  it("says nothing to do when every queue is empty", () => assert.equal(format(decide(state())), "none · nothing to do"));
});

describe("audit", () => {
  it("lists what no loop picks and no person is clearly asked about", () => {
    const text = audit(
      state({
        prs: [pr(1070, { labels: [L.readyForHuman], age: 4 * DAY })],
        issues: [
          issue(1053),
          issue(277, { sub_issues_summary: { total: 6, completed: 6 } }),
          blockerIssue(931, [929], { labels: [L.needsHuman] }),
          issue(601, { title: "⚖️ decision: licence" }),
          issue(288, { labels: [L.needsInfo], age: 64 * DAY }),
          issue(709),
          issue(511, { labels: [L.claimed], touched: 2 * DAY }),
        ],
        closedUnmergedPrs: [pr(730, { body: "Closes #709" })],
        landed: [1053],
      }),
    );
    for (const expected of [
      "close it · #1053",
      "close it · #277",
      "close it · #931",
      "take it off · #511",
      "no person asked · #601",
      "#288",
      "#1070",
      "closed unmerged — rebuild, relabel or close · #709",
    ])
      assert.ok(text.includes(expected), `${expected}\n${text}`);
  });

  it("says so when nothing is held", () => assert.equal(audit(state()), "none · nothing held"));
});

describe("format", () => {
  it("prints one line a skill can act on", () => {
    assert.equal(format({ pick: { queue: "ticket", issue: 128 } }), "ticket · #128");
    assert.equal(format({ pick: { queue: "drive", pr: 431, group: "conflicted" } }), "drive · #431 · conflicted");
  });
});

describe("inspect", () => {
  const root = mkdtempSync(join(tmpdir(), "next-work-git-"));
  after(() => rmSync(root, { recursive: true, force: true }));
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  const origin = join(root, "origin.git");
  const work = join(root, "work");
  git(root, "init", "-q", "--bare", origin);
  git(root, "init", "-q", "-b", "trunk", work);
  for (const [key, value] of [["user.email", "a@b.c"], ["user.name", "t"], ["commit.gpgsign", "false"]]) git(work, "config", key, value);
  const commit = (file, text, message) => {
    writeFileSync(join(work, file), text);
    git(work, "add", file);
    git(work, "commit", "-qm", message);
    return git(work, "rev-parse", "HEAD").trim();
  };
  commit("file.txt", "a\n", "base");
  const clean = commit("other.txt", "x\n", "clean");
  git(work, "reset", "-q", "--hard", "HEAD~1");
  const conflicting = commit("file.txt", "b\n", "theirs");
  git(work, "reset", "-q", "--hard", "HEAD~1");
  const trunk = commit("file.txt", "c\n", "💄 ui(#1056): ours");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-q", "origin", `${trunk}:refs/heads/trunk`, `${clean}:refs/pull/1/head`, `${conflicting}:refs/pull/2/head`);

  it("reads a conflict off the PR's head ref, and what landed off the base, without asking GitHub", () => {
    const { conflicts, landed } = inspect([1, 2], "trunk", work);
    assert.deepEqual([...conflicts], [[1, false], [2, true]]);
    assert.deepEqual([...landed], [1056]);
  });

  it("still decides the others when one PR's head cannot be fetched", () =>
    assert.deepEqual([...inspect([1, 3, 2], "trunk", work).conflicts], [[1, false], [2, true]]));

  it("leaves no refs behind", () => assert.equal(git(work, "for-each-ref", "refs/next-work"), ""));

  it("fails loudly when it cannot fetch the base, rather than reading nothing as landed", () =>
    assert.throws(() => inspect([1], "no-such-branch", work), /git could not fetch no-such-branch/));
});

describe("parseArgs", () => {
  it("takes --skip once, or once per item, as a session that lost several races writes it", () => {
    assert.deepEqual(parseArgs(["drive", "ticket", "--skip", "5", "7"]), { queues: ["drive", "ticket"], skip: [5, 7] });
    assert.deepEqual(parseArgs(["drive", "--skip", "5", "--skip", "7"]), { queues: ["drive"], skip: [5, 7] });
  });

  it("runs every queue when it is named none", () => assert.deepEqual(parseArgs([]), { queues: ["unblock", "drive", "ticket"], skip: [] }));

  it("refuses a queue it does not have, or a skip that is not a number", () => {
    assert.equal(parseArgs(["tickets"]), null);
    assert.equal(parseArgs(["drive", "--skip", "#5"]), null);
  });
});
