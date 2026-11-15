import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { load, resolve } from "./kitchen.mjs";
import {
  floor,
  formatReceipt,
  fromGitHub,
  gate,
  heading,
  LABELS,
  parse,
  parseNumstat,
  parseReceipt,
  relabel,
  ticketNumber,
} from "./risk.mjs";

const SHA = "3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a";
const OTHER = "0000000000000000000000000000000000000000";
const change = (path, added = 1, deleted = 0) => ({ path, added, deleted });

const { risk: repoRisk, expo } = load();
const underApp = (path) => (expo.appDir === "." ? path : `${expo.appDir}/${path}`);
const none = { high: [], medium: [], largeDiffLines: 400 };
const only = (tier, ...globs) => ({ ...none, [tier]: globs });

describe("floor", () => {
  it("reads a screen change as low", () => {
    assert.deepEqual(floor([change("src/screens/review.tsx")], repoRisk), {
      tier: "low",
      reasons: [],
    });
  });

  it("reads prose as low however long it is", () => {
    assert.equal(floor([change("docs/design/notes.md", 2000)], repoRisk).tier, "low");
  });

  it("refuses to run without the floors, which would drop every configured one", () => {
    assert.throws(() => floor([change("packages/auth/src/index.ts")]), /needs the kitchen's risk config/);
  });

  it("matches * within a segment and ** across segments", () => {
    const hit = (glob, path) => floor([change(path)], only("high", glob)).tier === "high";
    assert.equal(hit("a/*.ts", "a/b.ts"), true);
    assert.equal(hit("a/*.ts", "a/b/c.ts"), false);
    assert.equal(hit("a/**", "a/b/c.ts"), true);
    assert.equal(hit("a/**", "ab/c.ts"), false);
    assert.equal(hit("a/b-**", "a/b-x/y.ts"), true);
    assert.equal(hit("a.b", "axb"), false);
  });
});

describe("the fixed kitchen floor", () => {
  it("holds the gate's own files at high", () => {
    for (const path of [
      ".claude/kitchen/scripts/risk.mjs",
      ".claude/kitchen/scripts/kitchen.mjs",
      ".claude/kitchen.json",
      ".claude/skills/drive-pr-green/SKILL.md",
    ])
      assert.deepEqual(
        floor([change(path)], none),
        { tier: "high", reasons: ["the merge gate", "agent instructions"] },
        path,
      );
  });

  it("holds workflows at high, .claude and the lockfile at medium", () => {
    const cases = {
      ".github/workflows/ci.yml": ["high", "CI workflow"],
      ".claude/skills/evidence/SKILL.md": ["medium", "agent instructions"],
      ".claude/kitchen/scripts/receipt.mjs": ["medium", "agent instructions"],
      "pnpm-lock.yaml": ["medium", "dependencies"],
    };
    for (const [path, [tier, reason]] of Object.entries(cases))
      assert.deepEqual(floor([change(path)], none), { tier, reasons: [reason] }, path);
  });

  it("holds a native change at medium", () => {
    for (const path of [underApp("ios/Podfile"), underApp("app.config.ts")])
      assert.deepEqual(floor([change(path)], none), { tier: "medium", reasons: ["native build"] }, path);
  });

  it("cannot be lowered by kitchen.json", () => {
    const lowering = {
      high: [],
      medium: [
        ".github/workflows/**",
        ".claude/**",
        "pnpm-lock.yaml",
        ".claude/kitchen.json",
        ".claude/kitchen/scripts/risk.mjs",
        ".claude/skills/drive-pr-green/**",
      ],
      largeDiffLines: 400,
    };
    for (const path of [
      ".github/workflows/ci.yml",
      ".claude/kitchen.json",
      ".claude/kitchen/scripts/risk.mjs",
      ".claude/skills/drive-pr-green/SKILL.md",
    ])
      assert.equal(floor([change(path)], lowering).tier, "high", path);
    assert.equal(floor([change("pnpm-lock.yaml")], lowering).tier, "medium");
    assert.throws(() => resolve({ repo: "acme/app", humans: { default: "m" }, risk: { low: [] } }), /risk\.low/);
  });
});

describe("the floors this repo's kitchen.json sets", () => {
  const high = {
    "packages/db/src/schema.ts": "packages/db/src/schema.ts",
    "packages/db/src/schema/video.ts": "packages/db/src/schema/**",
    "packages/db/migrations/0042_add_streak.sql": "packages/db/migrations/**",
    "packages/auth/src/index.ts": "packages/auth/**",
    "apps/nextjs/src/app/api/auth/[...all]/route.ts": "apps/nextjs/src/app/api/auth/**",
    "packages/api/src/router/auth.ts": "packages/api/src/router/auth.ts",
    "packages/api/src/trpc.ts": "packages/api/src/trpc.ts",
    "packages/api/src/router/subscription.ts": "packages/api/src/router/subscription.ts",
    "packages/api/src/router/tokens.ts": "packages/api/src/router/tokens.ts",
    "packages/api/src/lib/token-pricing.ts": "packages/api/src/lib/token-**",
    "packages/api/src/lib/credit-grant.ts": "packages/api/src/lib/credit-**",
    "packages/api/src/lib/subscription-state.ts": "packages/api/src/lib/subscription**",
    "packages/api/src/lib/revenuecat.ts": "packages/api/src/lib/revenuecat**",
    "packages/api/src/lib/webhooks/revenuecat.ts": "packages/api/src/lib/webhooks/**",
    "packages/api/src/lib/services/token-ledger.ts": "packages/api/src/lib/services/token-ledger**",
    "packages/api/src/lib/services/subscription.ts": "packages/api/src/lib/services/subscription**",
    "apps/nextjs/src/app/api/webhooks/mux/route.ts": "apps/nextjs/src/app/api/webhooks/**",
  };
  const medium = {
    "docs/agents/loops.md": "docs/agents/**",
    "CLAUDE.md": "CLAUDE.md",
    "supabase/functions/process-clip/index.ts": "supabase/**",
    "tooling/eslint/base.js": "tooling/**",
    "turbo.json": "turbo.json",
    "pnpm-workspace.yaml": "pnpm-workspace.yaml",
    ".env.example": ".env.example",
  };

  it("holds auth, billing and the schema at high", () => {
    for (const [path, glob] of Object.entries(high))
      assert.deepEqual(floor([change(path)], repoRisk), { tier: "high", reasons: [glob] }, path);
  });

  it("holds docs, edge functions and build config at medium", () => {
    for (const [path, glob] of Object.entries(medium))
      assert.deepEqual(floor([change(path)], repoRisk), { tier: "medium", reasons: [glob] }, path);
  });

  it("lists a floor for every glob it names", () => {
    assert.deepEqual(new Set(Object.values(high)), new Set(repoRisk.high));
    assert.deepEqual(new Set(Object.values(medium)), new Set(repoRisk.medium));
  });

  it("leaves the db client and the pre-squash archive alone", () => {
    assert.equal(floor([change("packages/db/src/client.ts")], repoRisk).tier, "low");
    assert.equal(floor([change("packages/db/src/migrations/0042_old.sql")], repoRisk).tier, "low");
  });

  it("takes the highest tier and names every reason", () => {
    assert.deepEqual(
      floor([change("pnpm-lock.yaml"), change("packages/db/src/schema/quiz.ts")], repoRisk),
      { tier: "high", reasons: ["packages/db/src/schema/**", "dependencies"] },
    );
  });
});

describe("the large-diff floor", () => {
  const LARGE = repoRisk.largeDiffLines;

  it("raises a large code diff to medium", () => {
    assert.deepEqual(floor([change("src/screens/home.tsx", LARGE, 1)], repoRisk), {
      tier: "medium",
      reasons: [`${LARGE + 1} lines`],
    });
    assert.equal(floor([change("src/screens/home.tsx", LARGE)], repoRisk).tier, "low");
  });

  it("reads its threshold from risk.largeDiffLines", () => {
    const small = { ...none, largeDiffLines: 10 };
    assert.equal(floor([change("src/a.ts", 11)], small).tier, "medium");
    assert.equal(floor([change("src/a.ts", 10)], small).tier, "low");
    assert.equal(floor([change("src/a.ts", 500)], { ...none, largeDiffLines: 1000 }).tier, "low");
  });
});

describe("parseNumstat", () => {
  it("reads git's numstat, binaries as zero lines", () => {
    assert.deepEqual(parseNumstat("12\t3\tsrc/a.tsx\n-\t-\tassets/icon.png\n"), [
      { path: "src/a.tsx", added: 12, deleted: 3 },
      { path: "assets/icon.png", added: 0, deleted: 0 },
    ]);
  });
});

describe("the risk comment", () => {
  it("round-trips its heading", () => {
    assert.deepEqual(parse(`${heading({ tier: "low", sha: SHA })}\n\n| Question |`), {
      tier: "low",
      sha: SHA,
    });
  });

  it("refuses a short SHA, so a verdict is pinned to one commit", () => {
    assert.throws(() => heading({ tier: "low", sha: SHA.slice(0, 7) }));
    assert.equal(parse(`🎚️ **Risk** · low · ${SHA.slice(0, 7)}`), null);
  });

  it("reads only the first line", () => {
    assert.equal(parse(`Some prose\n${heading({ tier: "low", sha: SHA })}`), null);
  });
});

describe("the receipt", () => {
  it("round-trips each tier and blocked", () => {
    for (const tier of ["low", "medium", "high"]) {
      const line = formatReceipt({ tier, url: "https://github.com/x/y/pull/1#issuecomment-2" });
      assert.equal(parseReceipt(line).tier, tier);
    }
    const blocked = formatReceipt({ tier: "blocked", reason: "no diff", url: "https://x.test/1" });
    assert.deepEqual(parseReceipt(blocked), {
      tier: "blocked",
      reason: "no diff",
      url: "https://x.test/1",
    });
  });

  it("says who merges", () => {
    assert.equal(
      formatReceipt({ tier: "low", url: "https://x.test/1" }),
      "low · merges on green · https://x.test/1",
    );
    assert.equal(parseReceipt("low · a person merges · https://x.test/1"), null);
  });
});

describe("relabel", () => {
  it("swaps the old tier for the new one and keeps every other label", () => {
    assert.deepEqual(relabel(["evidence", LABELS.high], "medium"), ["evidence", LABELS.medium]);
  });

  it("leaves a PR the loop has not handed over unhanded", () => {
    assert.deepEqual(relabel(["evidence"], "low"), ["evidence", LABELS.low]);
    assert.deepEqual(relabel(["evidence"], "high"), ["evidence", LABELS.high]);
  });

  it("hands a handed-over low PR to auto-merge instead of a person", () => {
    assert.deepEqual(relabel(["ready-for-human", "evidence"], "low"), [
      "evidence",
      LABELS.low,
      LABELS.autoMerge,
    ]);
  });

  it("hands a handed-over PR that is no longer low back to a person", () => {
    assert.deepEqual(relabel([LABELS.low, LABELS.autoMerge, "evidence"], "medium"), [
      "evidence",
      LABELS.medium,
      "ready-for-human",
    ]);
  });
});

describe("ticketNumber", () => {
  it("reads the Closes trailer", () => {
    assert.equal(ticketNumber("| a |\n\nNext · merge\n\nCloses #69"), 69);
    assert.equal(ticketNumber("Refs #69"), null);
  });
});

describe("gate", () => {
  const body = [
    "| Phase | Found | Where |",
    "| --- | --- | --- |",
    "| code review | 3 found, 3 fixed, 0 open | #1 |",
    "| design review | n/a · no screen | — |",
    "",
    "Closes #69",
  ].join("\n");
  const pr = {
    headSha: SHA,
    headRepo: "acme/app",
    baseRepo: "acme/app",
    author: "maintainer",
    labels: ["ready-for-human"],
    body,
  };
  const input = {
    pr,
    changes: [change("src/screens/review.tsx")],
    comments: [{ author: "maintainer", body: heading({ tier: "low", sha: SHA }) }],
    trusted: ["maintainer"],
    ticketAuthor: "maintainer",
    risk: repoRisk,
  };
  const without = (patch) => gate({ ...input, ...patch });

  it("refuses to run without the floors", () => {
    const { risk, ...bare } = input;
    assert.throws(() => gate(bare), /needs the kitchen's risk config/);
  });

  it("lets a low change proven on its head merge", () => {
    assert.deepEqual(gate(input), {
      merge: true,
      description: "low on 3f2a1b0 · merges",
    });
  });

  it("needs the verdict on this commit, not an earlier one", () => {
    const comments = [{ author: "maintainer", body: heading({ tier: "low", sha: OTHER }) }];
    assert.equal(without({ comments }).merge, false);
  });

  it("takes the latest verdict on the head", () => {
    const comments = [
      ...input.comments,
      { author: "maintainer", body: heading({ tier: "medium", sha: SHA }) },
    ];
    assert.deepEqual(without({ comments }), {
      merge: false,
      description: "medium on 3f2a1b0 · a person merges",
    });
  });

  it("ignores a verdict from someone outside the trusted list", () => {
    const comments = [{ author: "stranger", body: heading({ tier: "low", sha: SHA }) }];
    assert.equal(without({ comments }).merge, false);
  });

  it("holds the path floor over a low verdict", () => {
    const result = without({ changes: [change(".github/workflows/ci.yml")] });
    assert.deepEqual(result, {
      merge: false,
      description: "high by path · CI workflow · a person merges",
    });
  });

  it("holds a floor that kitchen.json sets over a low verdict", () => {
    const changes = [change("packages/auth/src/index.ts")];
    assert.equal(without({ changes, risk: none }).merge, true);
    assert.deepEqual(without({ changes }), {
      merge: false,
      description: "high by path · packages/auth/** · a person merges",
    });
  });

  it("refuses a fork, an untrusted author, a blocked PR and an untrusted ticket", () => {
    assert.equal(without({ pr: { ...pr, headRepo: "someone/app" } }).merge, false);
    assert.equal(without({ pr: { ...pr, author: "stranger" } }).merge, false);
    assert.equal(without({ pr: { ...pr, labels: ["blocked"] } }).merge, false);
    assert.equal(without({ ticketAuthor: "stranger" }).merge, false);
    assert.equal(without({ pr: { ...pr, body: "no trailer" } }).merge, false);
  });

  it("refuses a body whose checks table still counts something open or blocked", () => {
    const open = body.replace("3 fixed, 0 open", "2 fixed, 1 open");
    assert.equal(without({ pr: { ...pr, body: open } }).merge, false);
    const blocked = body.replace("n/a · no screen", "blocked · no verification bucket");
    assert.equal(without({ pr: { ...pr, body: blocked } }).merge, false);
  });
});

describe("fromGitHub", () => {
  const pr = {
    head: { sha: SHA, repo: { full_name: "acme/app" } },
    base: { repo: { full_name: "acme/app" } },
    user: { login: "maintainer" },
    labels: ["auto-merge", { name: "risk:low" }],
    body: "Next · auto-merge\n\nCloses #69",
  };
  const comments = [{ user: { login: "maintainer" }, body: "🎚️ **Risk** · low" }];
  const ticket = { number: 69, user: { login: "maintainer" } };
  const changes = [change("src/screens/review.tsx")];

  it("reads what pull_request_read and issue_read hand back", () => {
    assert.deepEqual(fromGitHub({ pr, comments, ticket }, changes), {
      pr: {
        headSha: SHA,
        headRepo: "acme/app",
        baseRepo: "acme/app",
        author: "maintainer",
        labels: ["auto-merge", "risk:low"],
        body: pr.body,
      },
      changes,
      comments: [{ author: "maintainer", body: "🎚️ **Risk** · low" }],
      ticketAuthor: "maintainer",
    });
  });

  it("trusts no ticket author but the one its Closes line names", () => {
    const other = { number: 70, user: { login: "maintainer" } };
    assert.equal(fromGitHub({ pr, comments, ticket: other }, changes).ticketAuthor, null);
    assert.equal(fromGitHub({ pr, comments }, changes).ticketAuthor, null);
  });
});
