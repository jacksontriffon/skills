import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contractStatements } from "../adapters/db/expand.mjs";

const refused = (sql) => contractStatements(sql).map(({ why }) => why);

describe("the expand rule refuses what changes or removes something existing code reads", () => {
  const CONTRACTS = {
    "a DO block that drops a table": "DO $$ BEGIN DROP TABLE users; END $$;",
    "a DO block in a string literal": "DO 'BEGIN DROP TABLE users; END';",
    "a DROP behind a block comment": "/* c */ DROP TABLE t;",
    "a DROP on the line after a statement and its comment": "SELECT 1; -- n\nDROP TABLE t;",
    "a DELETE inside a WITH": "WITH gone AS (DELETE FROM t RETURNING id) SELECT id FROM gone;",
    "a DROP COLUMN spelled without COLUMN": "ALTER TABLE t DROP c;",
    "a DROP COLUMN with IF EXISTS": "ALTER TABLE t DROP COLUMN IF EXISTS c;",
    "a DROP COLUMN as the second clause": "ALTER TABLE t ADD COLUMN a int, DROP COLUMN c;",
    "a column type change without COLUMN or SET DATA": "ALTER TABLE t ALTER c TYPE int;",
    "a column type change with COLUMN": "ALTER TABLE t ALTER COLUMN c TYPE int;",
    "a SET DATA TYPE": "ALTER TABLE t ALTER COLUMN c SET DATA TYPE bigint;",
    "an ADD without COLUMN that is NOT NULL and has no default": "ALTER TABLE t ADD b int NOT NULL;",
    "a NOT NULL ADD COLUMN beside one that has a default": "ALTER TABLE t ADD COLUMN b int NOT NULL, ADD COLUMN a int DEFAULT 0;",
    "a SET NOT NULL": "ALTER TABLE t ALTER COLUMN c SET NOT NULL;",
    "a SET NOT NULL without COLUMN": "ALTER TABLE t ALTER c SET NOT NULL;",
    "a DROP CONSTRAINT": "ALTER TABLE t DROP CONSTRAINT c;",
    "a DROP TRIGGER": "DROP TRIGGER IF EXISTS tr ON t;",
    "a DROP VIEW": "DROP VIEW v;",
    "a DROP FUNCTION": "DROP FUNCTION f(int);",
    "a DROP POLICY": 'DROP POLICY "p" ON t;',
    "a DROP INDEX": "DROP INDEX t_idx;",
    "a DROP TYPE": "DROP TYPE kind;",
    "a DROP SCHEMA": "DROP SCHEMA s CASCADE;",
    "a RENAME": "ALTER TABLE t RENAME COLUMN a TO b;",
    "a RENAME of an index": "ALTER INDEX i RENAME TO j;",
    "an UPDATE": "UPDATE t SET a = 1;",
    "a DELETE": "DELETE FROM t;",
    "a TRUNCATE": "TRUNCATE t;",
    "an UPDATE after a statement that is fine": "CREATE TABLE b (id int); UPDATE b SET id = 1;",
    "an upsert that rewrites a row": "INSERT INTO t (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET id = 2;",
  };

  for (const [what, sql] of Object.entries(CONTRACTS)) {
    it(`refuses ${what}`, () => {
      assert.ok(refused(sql).length > 0, `${sql} passed`);
    });
  }

  it("names the statement it refused, without the comment that came before it", () => {
    const [hit] = contractStatements("/* note */ DROP TABLE t;");
    assert.equal(hit.statement, "DROP TABLE t");
  });

  it("says how to split a DROP", () => {
    const [hit] = contractStatements("DROP TABLE t;");
    assert.match(hit.why, /own ticket|own migration|split/i);
  });

  it("says a DO block is read by a person, not by this check", () => {
    const [hit] = contractStatements("DO $$ BEGIN PERFORM 1; END $$;");
    assert.match(hit.why, /DO block/);
  });

  it("refuses only the clause that is a contract, and says which statement it was", () => {
    const hits = contractStatements("CREATE TABLE ok (id int);\nALTER TABLE t ADD COLUMN b int NOT NULL, ADD COLUMN a int DEFAULT 0;");
    assert.equal(hits.length, 1);
    assert.match(hits[0].statement, /^ALTER TABLE t ADD COLUMN b int NOT NULL/);
  });

  it("refuses every contract in a file, not the first", () => {
    assert.equal(contractStatements("DROP TABLE a; DROP TABLE b;").length, 2);
  });
});

describe("the expand rule passes an expand", () => {
  const EXPANDS = {
    "a CREATE TABLE": 'CREATE TABLE "b" ("id" serial PRIMARY KEY, "note" text NOT NULL);',
    "a nullable ADD COLUMN": 'ALTER TABLE "a" ADD COLUMN "note" text;',
    "an ADD COLUMN that is NOT NULL with a default": "ALTER TABLE a ADD COLUMN n int NOT NULL DEFAULT 0;",
    "an ADD without COLUMN that has a default": "ALTER TABLE a ADD n int DEFAULT 0 NOT NULL;",
    "a serial ADD COLUMN": "ALTER TABLE a ADD COLUMN n serial NOT NULL;",
    "two ADD COLUMN clauses that are both fine": "ALTER TABLE a ADD COLUMN x int, ADD COLUMN y int NOT NULL DEFAULT 1;",
    "a column with a CHECK that mentions NOT NULL": "ALTER TABLE a ADD COLUMN x int CHECK (x IS NOT NULL);",
    "a CREATE INDEX": 'CREATE INDEX "a_idx" ON "a" ("id");',
    "a constraint with a CHECK on NOT NULL": "ALTER TABLE a ADD CONSTRAINT c CHECK (b IS NOT NULL);",
    "a foreign key with ON DELETE and ON UPDATE": 'ALTER TABLE "b" ADD CONSTRAINT "fk" FOREIGN KEY ("id") REFERENCES "a"("id") ON DELETE cascade ON UPDATE no action;',
    "dropping NOT NULL": "ALTER TABLE a ALTER COLUMN note DROP NOT NULL;",
    "dropping a default": "ALTER TABLE a ALTER COLUMN note DROP DEFAULT;",
    "an enum value": "ALTER TYPE kind ADD VALUE 'extra';",
    "a trigger that fires on UPDATE and DELETE": "CREATE TRIGGER t AFTER UPDATE OR DELETE ON a FOR EACH ROW EXECUTE FUNCTION f();",
    "a policy for UPDATE": "CREATE POLICY p ON a FOR UPDATE USING (true);",
    "a function whose body drops and deletes": "CREATE FUNCTION f() RETURNS void AS $body$ BEGIN DELETE FROM a; DROP TABLE b; END $body$ LANGUAGE plpgsql;",
    "a comment that mentions drop": "-- we do not drop anything here\nCREATE TABLE b (id int);",
    "a block comment that mentions DELETE": "/* never DELETE FROM a */ CREATE TABLE b (id int);",
    "a nested block comment": "/* outer /* DROP TABLE a; */ still comment */ CREATE TABLE b (id int);",
    "a string literal containing DELETE": "INSERT INTO a (note) VALUES ('DELETE FROM a; DROP TABLE b');",
    "an escaped quote inside a literal": "INSERT INTO a (note) VALUES ('it''s a DROP TABLE');",
    "a backslash-escaped quote in an E string": "INSERT INTO a (note) VALUES (E'it\\'s; DROP TABLE b');",
    "a quoted identifier that is named like a keyword": 'CREATE TABLE "delete" ("update" int, "drop" int);',
    "a drizzle statement-breakpoint comment": 'CREATE TABLE "b" ("id" int);--> statement-breakpoint\nCREATE INDEX "b_idx" ON "b" ("id");',
    "a file that runs its own transaction": "BEGIN;\nCREATE TABLE b (id int);\nCOMMIT;",
    "an empty file": "",
  };

  for (const [what, sql] of Object.entries(EXPANDS)) {
    it(`passes ${what}`, () => {
      assert.deepEqual(refused(sql), []);
    });
  }
});
