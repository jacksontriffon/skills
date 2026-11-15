import { fileURLToPath } from "node:url";

import { escapeRegExp, load } from "./kitchen.mjs";

// Nothing here compiles, gets linted, or has a test suite behind it. The format check only
// reaches files inside a workspace package, so a stray space in a package README is the
// most a skipped `format` can miss, and the push to main still catches it.
const SKIPPABLE_PATTERNS = [
  /\.mdx?$/i,
  /^docs\//,
  /^LICENSE(\.[^/]+)?$/,
  /^CODEOWNERS$/,
  /\.(png|jpe?g|gif|svg|webp|ico|mp4|mov)$/i,
  /\.(woff2?|ttf|otf)$/i,
  /^\.gitignore$/,
  /^\.gitattributes$/,
  /^\.editorconfig$/,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^\.github\/FUNDING\.yml$/i,
];

// `keep` wins over `skip`, so a runner can carve one file back out of a folder it ignores.
export function runners(kitchen = load()) {
  return {
    default: { skip: SKIPPABLE_PATTERNS, keep: [] },
    // skill-shape.test.mjs parses every SKILL.md and blockers.test.mjs both blocker files, so
    // `test` is the check an edit to one fails.
    ci: {
      skip: SKIPPABLE_PATTERNS,
      keep: [
        /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
        /^\.claude\/BLOCKERS\.md$/,
        /^\.claude\/kitchen\/docs\/BLOCKERS\.core\.md$/,
      ],
    },
    // The migration generator reads only packages/db: the schema, the migrations, its config.
    migrations: { skip: [/./], keep: [/^packages\/db\//] },
    // An OTA preview is the Expo bundle plus the API it points at. Agent tooling, flows,
    // fixtures, edge functions and test files never reach either one.
    preview: {
      skip: [
        ...SKIPPABLE_PATTERNS,
        /^\.claude\//,
        /^\.github\//,
        new RegExp(`^${escapeRegExp(kitchen.flows.replace(/\/+$/, ""))}/`),
        /^fixtures\//,
        /^supabase\/functions\//,
        /\.(test|manual)\.[cm]?[jt]sx?$/,
      ],
      keep: [
        /^\.github\/workflows\/pr-preview\.yml$/,
        /^\.claude\/kitchen\/scripts\/is-(native|skippable)-change\.mjs$/,
      ],
    },
  };
}

export function isSkippablePath(path, runner = "default", kitchen = load()) {
  const { skip, keep } = runners(kitchen)[runner];
  return (
    skip.some((pattern) => pattern.test(path)) &&
    !keep.some((pattern) => pattern.test(path))
  );
}

export function unskippableChanges(paths, runner = "default", kitchen = load()) {
  return paths.filter((path) => !isSkippablePath(path, runner, kitchen));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runner = process.argv[2] ?? "default";
  const kitchen = load();
  if (!(runner in runners(kitchen))) {
    process.stderr.write(
      `unknown runner "${runner}" — one of ${Object.keys(runners(kitchen)).join(", ")}\n`,
    );
    process.exit(2);
  }

  const { readFileSync } = await import("node:fs");
  const changed = readFileSync(0, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const path of unskippableChanges(changed, runner, kitchen)) console.log(path);
}
