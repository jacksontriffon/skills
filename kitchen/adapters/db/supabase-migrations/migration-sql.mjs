import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyRefusal } from "../expand.mjs";

const FILE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

export function readMigrations(directory) {
  let names;
  try {
    names = readdirSync(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return names
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const match = FILE.exec(name);
      if (!match) throw new Error(`${name} is not a migration file: <14 digits>_<name>.sql`);
      return { tag: name.slice(0, -".sql".length), version: match[1], name: match[2], sql: readFileSync(join(directory, name), "utf8") };
    });
}

export function pendingQuery(migrations) {
  if (migrations.length === 0) return "SELECT NULL::text AS tag WHERE false;";
  const rows = migrations.map((m) => `  ('${m.tag}', '${m.version}')`).join(",\n");
  return [
    "SELECT v.tag FROM (VALUES",
    rows,
    ") AS v(tag, version)",
    "WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = v.version)",
    "ORDER BY v.version;",
  ].join("\n");
}

// The CLI keeps a migration's statements beside its version; the whole file is one element here, since
// splitting SQL on `;` breaks a function body.
export function ledgerRow({ version, name, sql }) {
  let quote = "$kitchen_sql$";
  while (sql.includes(quote)) quote = `${quote.slice(0, -1)}_$`;
  return [
    "INSERT INTO supabase_migrations.schema_migrations (version, name, statements)",
    `VALUES ('${version}', '${name}', ARRAY[${quote}${sql}${quote}])`,
    "ON CONFLICT (version) DO NOTHING;",
  ].join("\n");
}

export function applySql(migration, { recordOnly = false } = {}) {
  if (recordOnly) return ledgerRow(migration);
  const body = migration.sql.trimEnd();
  const terminated = body.endsWith(";") ? body : `${body};`;
  // A file that runs its own transaction can't be nested inside another one.
  if (/^\s*(BEGIN|COMMIT)\s*;/im.test(body)) return `${terminated}\n\n${ledgerRow(migration)}\n`;
  return `BEGIN;\n\n${terminated}\n\n${ledgerRow(migration)}\n\nCOMMIT;\n`;
}

export function liveDirectory(given = process.env.KITCHEN_ADAPTER) {
  if (!given) throw new Error("run this through .claude/kitchen/scripts/adapter.mjs, which hands it kitchen.json's settings");
  const { settings, root } = JSON.parse(given);
  const relative = join(settings.dir ?? ".", "supabase/migrations");
  return { relative, directory: join(root, relative) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, tag, ...flags] = process.argv.slice(2);
  try {
    const { relative, directory } = liveDirectory();
    const migrations = readMigrations(directory);
    if (command === "pending") {
      console.log(pendingQuery(migrations));
    } else if (command === "apply" && tag) {
      const migration = migrations.find((m) => m.tag === tag);
      if (!migration) {
        console.error(`${tag} is not a file in ${relative}`);
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
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
