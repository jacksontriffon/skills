import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSkippablePath, unskippableChanges } from "./is-skippable-change.mjs";
import { load, resolve } from "./kitchen.mjs";

describe("isSkippablePath", () => {
  for (const path of [
    "README.md",
    "CLAUDE.md",
    "docs/agents/pr-format.md",
    "docs/observability/error-tracking.md",
    "docs/screenshots/before.png",
    "LICENSE",
    "LICENSE.md",
    "CODEOWNERS",
    "packages/api/README.mdx",
    "apps/mobile/assets/icon.png",
    "apps/mobile/assets/splash.svg",
    "docs/screenshots/demo.mp4",
    "apps/mobile/assets/fonts/Inter.woff2",
    ".gitignore",
    ".gitattributes",
    ".editorconfig",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/FUNDING.yml",
  ]) {
    it(`flags ${path}`, () => assert.ok(isSkippablePath(path)));
  }

  for (const path of [
    "apps/mobile/src/app/index.tsx",
    "packages/api/src/router/video.ts",
    "package.json",
    "pnpm-lock.yaml",
    ".github/workflows/ci.yml",
    "supabase/migrations/0001_init.sql",
    "apps/mobile/app.config.ts",
  ]) {
    it(`does not flag ${path}`, () => assert.ok(!isSkippablePath(path)));
  }
});

describe("unskippableChanges", () => {
  it("keeps only the unskippable paths, in order", () => {
    assert.deepEqual(
      unskippableChanges([
        "README.md",
        "packages/api/src/router/video.ts",
        "docs/agents/pr-format.md",
        "package.json",
      ]),
      ["packages/api/src/router/video.ts", "package.json"],
    );
  });

  it("is empty when every changed path is skippable", () => {
    assert.deepEqual(
      unskippableChanges(["README.md", "docs/agents/pr-format.md", "LICENSE"]),
      [],
    );
  });
});

describe("the ci runner", () => {
  it("runs on a SKILL.md, which skill-shape parses", () => {
    assert.ok(!isSkippablePath(".claude/skills/find-work/SKILL.md", "ci"));
  });

  it("runs on both blocker files, which blockers.test.mjs reads", () => {
    for (const path of [".claude/BLOCKERS.md", ".claude/kitchen/docs/BLOCKERS.core.md"])
      assert.ok(!isSkippablePath(path, "ci"), path);
  });

  it("skips the rest of the skippable patterns", () => {
    for (const path of [
      "README.md",
      "docs/agents/pr-format.md",
      ".claude/skills/find-work/references/notes.md",
    ])
      assert.ok(isSkippablePath(path, "ci"), path);
  });
});

describe("the default runner", () => {
  it("still skips a SKILL.md", () => {
    assert.ok(isSkippablePath(".claude/skills/find-work/SKILL.md"));
  });
});

describe("the preview runner", () => {
  for (const path of [
    "README.md",
    ".claude/skills/find-work/SKILL.md",
    ".claude/kitchen/scripts/receipt.mjs",
    ".github/workflows/ci.yml",
    ".maestro/flows/home.yaml",
    "fixtures/dev-user.json",
    "supabase/functions/process-clip/index.ts",
    "packages/api/src/router/video.test.ts",
    "apps/mobile/src/utils/snap.test.tsx",
    "packages/api/src/lib/snap-eval.manual.ts",
  ]) {
    it(`skips ${path}`, () => assert.ok(isSkippablePath(path, "preview")));
  }

  for (const path of [
    "apps/mobile/src/app/index.tsx",
    "apps/mobile/app.config.ts",
    "apps/nextjs/src/app/api/trpc/[trpc]/route.ts",
    "packages/api/src/router/video.ts",
    "packages/db/src/schema/video.ts",
    "tooling/github/setup/action.yml",
    "scripts/ensure-env.mjs",
    "pnpm-lock.yaml",
    ".github/workflows/kitchen-pr-preview.yml",
    ".claude/kitchen/scripts/is-native-change.mjs",
    ".claude/kitchen/scripts/is-skippable-change.mjs",
  ]) {
    it(`runs on ${path}`, () => assert.ok(!isSkippablePath(path, "preview")));
  }

  it("skips the flows folder kitchen.json names, and only that one", () => {
    const kitchen = resolve({ repo: "someone/app", humans: { default: "someone" }, flows: "e2e/flows" });
    assert.ok(isSkippablePath("e2e/flows/home.yaml", "preview", kitchen));
    assert.ok(!isSkippablePath(`${load().flows}/flows/home.yaml`, "preview", kitchen));
  });

  it("keeps only what reaches the bundle or the job", () => {
    assert.deepEqual(
      unskippableChanges(
        [
          ".claude/skills/evidence/SKILL.md",
          "apps/mobile/src/app/index.tsx",
          ".maestro/flows/home.yaml",
        ],
        "preview",
      ),
      ["apps/mobile/src/app/index.tsx"],
    );
  });
});

describe("the migrations runner", () => {
  for (const path of [
    "packages/db/src/schema/video.ts",
    "packages/db/src/auth-schema.ts",
    "packages/db/migrations/0007_add_quiz_streak.sql",
    "packages/db/migrations/meta/_journal.json",
    "packages/db/src/client.ts",
    "packages/db/package.json",
  ]) {
    it(`runs on ${path}`, () =>
      assert.ok(!isSkippablePath(path, "migrations")));
  }

  for (const path of [
    "apps/mobile/src/app/index.tsx",
    "packages/api/src/router/video.ts",
    "pnpm-lock.yaml",
    ".github/workflows/ci.yml",
    "README.md",
  ]) {
    it(`skips ${path}`, () => assert.ok(isSkippablePath(path, "migrations")));
  }
});
