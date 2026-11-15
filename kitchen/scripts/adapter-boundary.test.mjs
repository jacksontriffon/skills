import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, it } from "node:test";

import { at, exists, ROOT, vendored } from "./layout.mjs";
import { WORKFLOWS } from "./doctor.mjs";

const read = (path) => readFileSync(join(ROOT, at(path)), "utf8");

const BACKENDS = [/drizzle/i, /better[- ]?auth/i, /posthog/i, /supabase/i];

const filesUnder = (dir) =>
  readdirSync(join(ROOT, at(dir))).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(ROOT, at(path))).isDirectory() ? filesUnder(path) : [path];
  });

const CORE_SKILLS = [
  "find-work",
  "pick-up-ticket",
  "drive-pr-green",
  "unblock",
  "risk-review",
  "post-comment",
  "screenshot",
  "search-errors",
  "fix-top-error",
  "implement",
  "code-review",
  "evidence",
  "design-review",
  "design-setup",
  "verify-expo",
  "kitchen-setup",
];

const CORE_AGENTS = [
  "implementer",
  "code-reviewer",
  "content-reviewer",
  "evidence-runner",
  "design-reviewer",
  "risk-reviewer",
  "blocker-fixer",
];

const EXEMPT = {
  "kitchen.schema.json": [/supabase/i],
  "is-skippable-change.mjs": [/supabase/i],
};

const STANDS_IN_FOR_A_BACKEND = /\.test\.mjs$|-stub\.mjs$|-fixtures\.mjs$|\/fixtures\//;

const CORE = [
  ...filesUnder(".claude/kitchen/scripts").filter((path) => !STANDS_IN_FOR_A_BACKEND.test(path)),
  ...filesUnder(".claude/kitchen/docs"),
  ...CORE_SKILLS.flatMap((skill) => filesUnder(`.claude/skills/${skill}`)),
  ...CORE_AGENTS.map((agent) => `.claude/agents/${agent}.md`),
  ".claude/kitchen/kitchen.schema.json",
  ...WORKFLOWS.map((name) => `.github/workflows/kitchen-${name}.yml`),
];

describe("no core file names a backend an adapter owns", () => {
  for (const path of CORE) {
    it(path, () => {
      const exempt = (EXEMPT[path.split("/").at(-1)] ?? []).map(String);
      const text = read(path);
      const named = BACKENDS.filter((pattern) => !exempt.includes(String(pattern)) && pattern.test(text)).map(String);
      assert.deepEqual(named, []);
    });
  }

  it("exempts a file only for the backend it must name, and only a file that is not an adapter's", () => {
    for (const [name, patterns] of Object.entries(EXEMPT)) {
      assert.ok(CORE.some((path) => path.endsWith(`/${name}`)), `${name} is exempt but not checked`);
      assert.ok(patterns.length > 0);
    }
    assert.equal(CORE.some((path) => path.startsWith(".claude/kitchen/adapters/")), false);
  });

  it("covers the supabase adapters' files with the same rule the other adapters' files are under: they are adapter files, not core", () => {
    for (const path of filesUnder(".claude/kitchen/adapters").filter((file) => /supabase/.test(file)))
      assert.equal(CORE.includes(path), false, path);
  });

  it("drive.mjs names no backend's session key, so a new auth adapter's own name reads as signed in", () => {
    const text = read(".claude/kitchen/scripts/drive.mjs");
    assert.deepEqual(text.match(/\bsb-|session_token|auth[-_]token|better[-_.]auth|supabase/gi) ?? [], []);
  });

  it("checks for supabase, since the default adapters are its", () => {
    assert.ok(BACKENDS.some((pattern) => pattern.test("Supabase")));
  });

  it("covers the core scripts, skills, agents and workflows, so a new file cannot slip past by being new", () => {
    for (const path of [
      ".claude/kitchen/scripts/session-up.sh",
      ".claude/kitchen/scripts/dev-server.sh",
      ".claude/kitchen/scripts/adapter.mjs",
      ".claude/skills/evidence/SKILL.md",
      ".claude/agents/blocker-fixer.md",
    ])
      assert.ok(CORE.includes(path), `${path} is not checked`);
  });
});

describe("what moved is where it now lives", () => {
  const MOVED = [
    ".claude/kitchen/scripts/session-up.sh",
    ".claude/kitchen/scripts/dev-server.sh",
    ".claude/kitchen/adapters/stack/trpc-next/up",
    ".claude/kitchen/adapters/stack/supabase-local/up",
    ".claude/kitchen/adapters/stack/none/up",
    ".claude/kitchen/adapters/db/supabase-migrations/migrate",
    ".claude/kitchen/adapters/auth/supabase-auth/sign-in",
    ".claude/kitchen/scripts/maestro-yaml.mjs",
    ".claude/kitchen/adapters/db/postgres-drizzle/migration-sql.mjs",
    ".claude/kitchen/adapters/auth/better-auth/sign-in",
    ".claude/kitchen/adapters/evidenceHost/git-branch/push",
  ];
  const GONE = [
    ".claude/scripts/session-up.sh",
    ".claude/scripts/dev-server.sh",
    ".claude/scripts/dev-login.mjs",
    ".claude/scripts/migration-sql.mjs",
    ".claude/scripts/migration-sql.test.mjs",
  ];

  for (const path of MOVED) it(`${path} exists and is executable where it is a script`, () => {
    assert.ok(exists(path), `${path} is missing`);
    if (!path.endsWith(".mjs")) assert.ok(statSync(join(ROOT, at(path))).mode & 0o111, `${path} is not executable`);
  });

  for (const path of GONE) it(`${path} is gone`, () => assert.equal(exists(path), false));

  it("session-up.sh and dev-server.sh are executable", () => {
    for (const name of ["session-up.sh", "dev-server.sh", "push-shots.sh"])
      assert.ok(statSync(join(ROOT, at(`.claude/kitchen/scripts/${name}`))).mode & 0o111, name);
  });

  const TEXT = /\.(md|mjs|sh|ya?ml|json|ts|txt)$/;
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((path) => TEXT.test(path) && !path.endsWith("pnpm-lock.yaml") && !path.endsWith("adapter-boundary.test.mjs"))
    .filter((path) => existsSync(join(ROOT, path)))
    .map((path) => ({ path, as: vendored(path) }));

  const MOVED_PATH = /(?<![\w./$-])((?:\.{1,2}\/|[\w.-]+\/)+)(session-up\.sh|dev-server\.sh|dev-login\.mjs|migration-sql(?:\.test)?\.mjs)(?![\w.-])/g;

  const staleReferences = (path, text, found = exists) => [
    ...(/dev-login\.mjs/.test(text) ? [`${path}: dev-login.mjs`] : []),
    ...[...text.matchAll(MOVED_PATH)]
      .map((match) => match[0])
      .filter((target) => !found(posix.normalize(posix.join(posix.dirname(path), target))) && !found(posix.normalize(target)))
      .map((target) => `${path}: ${target}`),
  ];

  it("nothing tracked still points at a moved script's old path", () => {
    assert.deepEqual(
      tracked.flatMap(({ path, as }) => staleReferences(as, readFileSync(join(ROOT, path), "utf8"))),
      [],
    );
  });

  describe("the stale-path check, on fixtures", () => {
    const KITCHEN_SCRIPTS = new Set([
      ".claude/kitchen/scripts/session-up.sh",
      ".claude/kitchen/scripts/dev-server.sh",
      ".claude/kitchen/scripts/migration-sql.test.mjs",
      ".claude/kitchen/adapters/db/postgres-drizzle/migration-sql.mjs",
    ]);
    const known = (candidate) => KITCHEN_SCRIPTS.has(candidate.replace(/^\.\//, ""));
    const stale = (path, text) => staleReferences(path, text, known);

    const STALE_FIXTURES = {
      "a code span with the old .claude/scripts path": ["docs/a.md", "run `.claude/scripts/session-up.sh up`"],
      "a code span with a ../scripts path that resolves nowhere": ["docs/a.md", "start it with `../scripts/dev-server.sh start`"],
      "a bare scripts/ path in prose": ["docs/a.md", "see scripts/session-up.sh for the order"],
      "a bare scripts/ path in a shell block": ["docs/a.md", "```bash\nscripts/dev-server.sh start\n```"],
      "a markdown link that resolves nowhere": ["docs/a.md", "[up](../scripts/session-up.sh)"],
      "a link to the old migration-sql": ["docs/a.md", "[sql](../../.claude/scripts/migration-sql.mjs)"],
      "the old migration-sql test": ["docs/a.md", "`.claude/scripts/migration-sql.test.mjs`"],
      "dev-login.mjs anywhere": ["docs/a.md", "the old dev-login.mjs"],
      "a ./ path that resolves nowhere": ["docs/a.md", "`./scripts/dev-server.sh`"],
    };

    for (const [what, [path, text]] of Object.entries(STALE_FIXTURES)) {
      it(`flags ${what}`, () => {
        assert.equal(stale(path, text).length > 0, true, text);
      });
    }

    const FINE_FIXTURES = {
      "a code span with the kitchen path": ["README.md", "`.claude/kitchen/scripts/session-up.sh up`"],
      "a ../scripts path that resolves from the file's own directory": [".claude/kitchen/docs/a.md", "see `../scripts/session-up.sh`"],
      "a link that resolves": [".claude/kitchen/docs/a.md", "[up](../scripts/dev-server.sh)"],
      "a sibling path to the adapter's own file": [".claude/kitchen/adapters/db/README.md", "`postgres-drizzle/migration-sql.mjs`"],
      "the bare name with no directory": ["docs/a.md", "run session-up.sh and dev-server.sh"],
      "a path under a shell variable": ["README.md", 'run "$KITCHEN/dev-server.sh" stop'],
      "a URL": ["docs/a.md", "https://example.test/blob/main/scripts/session-up.sh"],
    };

    for (const [what, [path, text]] of Object.entries(FINE_FIXTURES)) {
      it(`leaves ${what} alone`, () => {
        assert.deepEqual(stale(path, text), []);
      });
    }
  });
});
