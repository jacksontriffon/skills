import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  applySql,
  ledgerRow,
  pendingQuery,
  readMigrations,
} from "../adapters/db/postgres-drizzle/migration-sql.mjs";
import { load } from "./kitchen.mjs";
import { ROOT } from "./layout.mjs";

function migrationsDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "migrations-"));
  mkdirSync(join(dir, "meta"));
  writeFileSync(
    join(dir, "meta", "_journal.json"),
    JSON.stringify({
      entries: Object.keys(files).map((tag, idx) => ({
        idx,
        tag,
        when: 1790000000000 + idx,
      })),
    }),
  );
  for (const [tag, sql] of Object.entries(files))
    writeFileSync(join(dir, `${tag}.sql`), sql);
  return pathToFileURL(`${dir}/`);
}

const sha = (text) => createHash("sha256").update(text).digest("hex");

const liveDir = join(ROOT, load().adapters.db.dir ?? ".", "migrations");
const live = pathToFileURL(`${liveDir}/`);
const noLiveJournal = !existsSync(join(liveDir, "meta/_journal.json")) && `no migrations journal at ${liveDir}`;

describe("readMigrations", () => {
  it("hashes each file the way drizzle's migrator records it", () => {
    const sql = 'CREATE TABLE "a" ("id" uuid);';
    const [m] = readMigrations(migrationsDir({ "0000_first": sql }));
    assert.equal(m.hash, sha(sql));
    assert.equal(m.createdAt, 1790000000000);
  });

  it("reads the live directory's journal in order", { skip: noLiveJournal }, () => {
    const tags = readMigrations(live).map((m) => m.tag);
    assert.ok(tags.length > 0);
    assert.deepEqual(tags, [...tags].sort());
    assert.match(tags[0], /^0000_/);
  });

  it("refuses a tag that could break out of a quoted literal", () => {
    assert.throws(() =>
      readMigrations(migrationsDir({ "0000_x'; DROP": "SELECT 1;" })),
    );
  });
});

describe("pendingQuery", () => {
  it("names every migration, matched on hash or created_at", () => {
    const migrations = readMigrations(
      migrationsDir({ "0000_a": "SELECT 1;", "0001_b": "SELECT 2;" }),
    );
    const query = pendingQuery(migrations);
    assert.match(query, /\('0000_a', '[0-9a-f]{64}', 1790000000000\)/);
    assert.match(query, /\('0001_b', '[0-9a-f]{64}', 1790000000001\)/);
    assert.match(query, /m\.hash = v\.hash OR m\.created_at = v\.created_at/);
  });
});

describe("applySql", () => {
  const migration = { hash: "ab".repeat(32), createdAt: 1790000000000 };

  it("runs the file and records its row in one transaction", () => {
    const sql = applySql({ ...migration, sql: 'CREATE TABLE "a" ("id" uuid)' });
    assert.match(sql, /^BEGIN;/);
    assert.match(sql, /CREATE TABLE "a" \("id" uuid\);/);
    assert.match(sql, /INSERT INTO drizzle\.__drizzle_migrations/);
    assert.match(sql, /COMMIT;\n$/);
  });

  it("leaves a file that runs its own transaction unwrapped", () => {
    const sql = applySql({
      ...migration,
      sql: "BEGIN;\nALTER TABLE a ADD COLUMN b int;\nCOMMIT;\n",
    });
    assert.doesNotMatch(sql, /^BEGIN;\n\nBEGIN;/);
    assert.equal(sql.match(/BEGIN;/g).length, 1);
    assert.match(sql, /COMMIT;\n\nINSERT INTO drizzle/);
  });

  it("records the row alone when asked to", () => {
    const sql = applySql(
      { ...migration, sql: "DROP TABLE a;" },
      { recordOnly: true },
    );
    assert.doesNotMatch(sql, /DROP TABLE/);
    assert.equal(sql, ledgerRow(migration));
  });

  it("never records a row twice", () => {
    assert.match(
      ledgerRow(migration),
      new RegExp(
        `WHERE NOT EXISTS \\(SELECT 1 FROM drizzle\\.__drizzle_migrations m WHERE m\\.hash = '${migration.hash}' OR m\\.created_at = 1790000000000\\);`,
      ),
    );
  });
});
