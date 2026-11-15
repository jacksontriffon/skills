import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyRefusal } from "../expand.mjs";

const TAG = /^\d{4}_[a-z0-9_]+$/;

export function readMigrations(dir) {
  const journal = JSON.parse(
    readFileSync(new URL("meta/_journal.json", dir), "utf8"),
  );
  return journal.entries.map(({ tag, when }) => {
    if (!TAG.test(tag)) throw new Error(`${tag} is not a migration tag`);
    const sql = readFileSync(new URL(`${tag}.sql`, dir), "utf8");
    return {
      tag,
      createdAt: when,
      // drizzle-orm's migrator hashes the file exactly like this before it records a row.
      hash: createHash("sha256").update(sql).digest("hex"),
      sql,
    };
  });
}

// drizzle's own migrate only compares against the newest created_at, so a migration a
// branch applied out of order would read as done. Either field matching means recorded:
// a file reformatted after it ran keeps its created_at, and one regenerated under a new
// number keeps its hash.
const recorded = (hash, createdAt) =>
  `SELECT 1 FROM drizzle.__drizzle_migrations m WHERE m.hash = ${hash} OR m.created_at = ${createdAt}`;

export function pendingQuery(migrations) {
  const rows = migrations
    .map((m) => `  ('${m.tag}', '${m.hash}', ${m.createdAt})`)
    .join(",\n");
  return [
    "SELECT v.tag FROM (VALUES",
    rows,
    ") AS v(tag, hash, created_at)",
    `WHERE NOT EXISTS (${recorded("v.hash", "v.created_at")})`,
    "ORDER BY v.created_at;",
  ].join("\n");
}

export function ledgerRow({ hash, createdAt }) {
  return [
    "INSERT INTO drizzle.__drizzle_migrations (hash, created_at)",
    `SELECT '${hash}', ${createdAt}`,
    `WHERE NOT EXISTS (${recorded(`'${hash}'`, createdAt)});`,
  ].join("\n");
}

export function applySql(migration, { recordOnly = false } = {}) {
  if (recordOnly) return ledgerRow(migration);
  const body = migration.sql.trimEnd();
  const terminated = body.endsWith(";") ? body : `${body};`;
  // A file that runs its own transaction can't be nested inside another one.
  if (/^\s*(BEGIN|COMMIT)\s*;/im.test(body))
    return `${terminated}\n\n${ledgerRow(migration)}\n`;
  return `BEGIN;\n\n${terminated}\n\n${ledgerRow(migration)}\n\nCOMMIT;\n`;
}

export function liveDirectory(given = process.env.KITCHEN_ADAPTER) {
  if (!given) throw new Error("run this through .claude/kitchen/scripts/adapter.mjs, which hands it kitchen.json's settings");
  const { settings, root } = JSON.parse(given);
  const relative = settings.migrations ?? join(settings.dir ?? ".", "migrations");
  return { relative, url: pathToFileURL(`${join(root, relative)}/`) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, tag, ...flags] = process.argv.slice(2);
  const { relative, url } = liveDirectory();
  const migrations = readMigrations(url);

  if (command === "pending") {
    console.log(pendingQuery(migrations));
  } else if (command === "apply" && tag) {
    const migration = migrations.find((m) => m.tag === tag);
    if (!migration) {
      console.error(`${tag} is not in ${relative}/meta/_journal.json`);
      process.exit(1);
    }
    const recordOnly = flags.includes("--record-only");
    const refusal = recordOnly || flags.includes("--allow-contract") ? null : applyRefusal(tag, migration.sql);
    if (refusal) {
      console.error(refusal);
      process.exit(1);
    }
    console.log(applySql(migration, { recordOnly }));
  } else {
    console.error("usage: adapter.mjs db pending | apply <tag> [--record-only | --allow-contract]");
    process.exit(1);
  }
}
