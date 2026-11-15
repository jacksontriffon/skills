import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "node:test";

import { sandbox } from "./adapter-sandbox.mjs";
import { load } from "./kitchen.mjs";

const real = load().adapters.db;
const LOCAL = `postgresql://postgres:postgres@localhost:5432/${real.database}`;

const state = (sandboxed, name) => sandboxed.path(`.state-${name}`);

function container({ clusterInstalled = true, ready = false, databaseExists = false } = {}) {
  const sandboxed = sandbox({ isolated: true });
  const stateful = (name) => `[ -e "${state(sandboxed, name)}" ]`;
  if (clusterInstalled) sandboxed.shim("pg_ctlcluster", '#!/bin/sh\necho "pg_ctlcluster $*" >>"$STUB_LOG"\n[ "$2" = main ] && [ "$3" = start ] && touch "$STATE_STARTED"\nexit 0\n'.replace("$STATE_STARTED", state(sandboxed, "started")));
  sandboxed.shim(
    "apt-get",
    `#!/bin/sh\necho "apt-get $*" >>"$STUB_LOG"\ncat >"${sandboxed.path(".shims/pg_ctlcluster")}" <<'EOS'\n#!/bin/sh\necho "pg_ctlcluster $*" >>"$STUB_LOG"\ntouch "${state(sandboxed, "started")}"\nEOS\nchmod +x "${sandboxed.path(".shims/pg_ctlcluster")}"\n`,
  );
  sandboxed.shim(
    "pg_isready",
    `#!/bin/sh\n${ready ? "exit 0" : `${stateful("started")} && exit 0 || exit 2`}\n`,
  );
  sandboxed.shim(
    "su",
    `#!/bin/sh
cmd="$5"
echo "su $cmd" >>"$STUB_LOG"
case "$cmd" in
*pg_database*) ${databaseExists ? "echo 1" : `${stateful("created")} && echo 1 || true`} ;;
createdb*) touch "${state(sandboxed, "created")}" ;;
esac
exit 0
`,
  );
  sandboxed.shim("pnpm", '#!/bin/sh\necho "pnpm $PWD $* POSTGRES_URL=$POSTGRES_URL" >>"$STUB_LOG"\n');
  sandboxed.write(".env.example", "AUTH_SECRET=placeholder\n");
  sandboxed.write(`${real.dir}/.keep`, "");
  const env = { POSTGRES_URL: "postgresql://hosted.example:6543/postgres" };
  return {
    sandboxed,
    prepare: (extra = {}) => sandboxed.dispatch(["db", "prepare"], { env: { ...env, ...extra } }),
    down: () => sandboxed.dispatch(["db", "down"], { env }),
  };
}

describe("db postgres-drizzle: prepare", () => {
  it("prints the local POSTGRES_URL on stdout and nothing else, whatever the container exports", () => {
    const { prepare } = container();
    const run = prepare();
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, `POSTGRES_URL=${LOCAL}\n`);
  });

  it("installs the server when the container has none, and not when it has one", () => {
    const bare = container({ clusterInstalled: false });
    assert.equal(bare.prepare().status, 0);
    assert.ok(bare.sandboxed.log().includes(`apt-get install -y -qq postgresql-${real.version}`), bare.sandboxed.log().join("\n"));
    const equipped = container();
    equipped.prepare();
    assert.equal(equipped.sandboxed.log().some((line) => line.startsWith("apt-get")), false);
  });

  it("starts the cluster only when it is not answering", () => {
    const cold = container();
    cold.prepare();
    assert.ok(cold.sandboxed.log().includes(`pg_ctlcluster ${real.version} main start`));
    const warm = container({ ready: true });
    warm.prepare();
    assert.equal(warm.sandboxed.log().some((line) => line.startsWith("pg_ctlcluster")), false);
  });

  it("sets the postgres password and creates the database only when it is missing", () => {
    const fresh = container();
    fresh.prepare();
    assert.ok(fresh.sandboxed.log().some((line) => line.includes("alter user postgres password")));
    assert.ok(fresh.sandboxed.log().includes(`su createdb ${real.database}`), fresh.sandboxed.log().join("\n"));
    const existing = container({ databaseExists: true });
    existing.prepare();
    assert.equal(existing.sandboxed.log().some((line) => line.startsWith("su createdb")), false);
  });

  it("pushes the schema from the db package's directory, at the local database, with confirmation off", () => {
    const { sandboxed, prepare } = container();
    prepare();
    const push = sandboxed.log().find((line) => line.startsWith("pnpm "));
    const [, cwd, ...rest] = push.split(" ");
    assert.ok(cwd.endsWith(`/${real.dir}`), cwd);
    assert.deepEqual(rest, ["exec", "drizzle-kit", "push", "--force", `POSTGRES_URL=${LOCAL}`]);
  });

  it("writes the local URL into .env once, creating .env from .env.example, however many times it runs", () => {
    const { sandboxed, prepare } = container();
    prepare();
    prepare();
    const lines = readFileSync(sandboxed.path(".env"), "utf8").trim().split("\n");
    assert.deepEqual(lines, ["AUTH_SECRET=placeholder", `POSTGRES_URL='${LOCAL}'`]);
  });

  it("fails, saying so, when the cluster never answers", () => {
    const { sandboxed, prepare } = container();
    sandboxed.shim("pg_ctlcluster", "#!/bin/sh\nexit 0\n");
    sandboxed.shim("sleep", "#!/bin/sh\nexit 0\n");
    const run = prepare();
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /did not come up/);
  });
});

describe("db postgres-drizzle: down", () => {
  it("stops the cluster, and is fine if there is none to stop", () => {
    const { sandboxed, down } = container();
    assert.equal(down().status, 0);
    assert.ok(sandboxed.log().includes(`pg_ctlcluster ${real.version} main stop`));
    const gone = container({ clusterInstalled: false });
    assert.equal(gone.down().status, 0);
  });
});

const JOURNAL = (tags) =>
  JSON.stringify({ version: "7", dialect: "postgresql", entries: tags.map((tag, idx) => ({ idx, version: "7", when: 1700000000000 + idx, tag, breakpoints: true })) });

function drizzle({ sql, noop = false, custom = false } = {}) {
  const sandboxed = sandbox();
  const dir = `${real.dir}/migrations`;
  sandboxed.write(`${dir}/meta/_journal.json`, JOURNAL(["0000_start"]));
  sandboxed.write(`${dir}/0000_start.sql`, 'CREATE TABLE "a" ("id" serial PRIMARY KEY);\n');
  sandboxed.shim(
    "pnpm",
    `#!/bin/sh
echo "pnpm $PWD $* POSTGRES_URL=$POSTGRES_URL" >>"$STUB_LOG"
${noop ? 'echo "No schema changes, nothing to migrate" >&2; exit 0' : ""}
node -e '
const fs = require("node:fs");
const dir = "${sandboxed.path(dir)}";
const name = process.argv[process.argv.indexOf("--name") + 1];
const journal = JSON.parse(fs.readFileSync(dir + "/meta/_journal.json", "utf8"));
const tag = "0001_" + name;
journal.entries.push({ idx: 1, version: "7", when: 1700000000001, tag, breakpoints: true });
fs.writeFileSync(dir + "/meta/_journal.json", JSON.stringify(journal));
fs.writeFileSync(dir + "/" + tag + ".sql", process.env.STUB_SQL ?? "");
' -- "$@"
`,
  );
  const migrate = (args, env = {}) =>
    sandboxed.dispatch(["db", "migrate", ...args], { env: { STUB_SQL: sql ?? "", ...env } });
  return { sandboxed, migrate };
}

describe("db postgres-drizzle: migrate", () => {
  it("generates under the given name, from the db package's directory, without needing a database", () => {
    const { sandboxed, migrate } = drizzle({ sql: 'CREATE TABLE "b" ("id" serial);\n' });
    const run = migrate(["--name", "add_b"], { POSTGRES_URL: "" });
    assert.equal(run.status, 0, run.stderr);
    const [, cwd, ...rest] = sandboxed.log()[0].split(" ");
    assert.ok(cwd.endsWith(`/${real.dir}`), cwd);
    assert.deepEqual(rest.slice(0, 4), ["exec", "drizzle-kit", "generate", "--name"]);
    assert.equal(rest[4], "add_b");
    assert.match(rest.at(-1), /^POSTGRES_URL=postgres.+/);
  });

  it("prints the tag it wrote, once, on stdout", () => {
    const { migrate } = drizzle({ sql: 'CREATE TABLE "b" ("id" serial);\n' });
    assert.equal(migrate(["--name", "add_b"]).stdout, "0001_add_b\n");
  });

  for (const sql of [
    'CREATE INDEX "b_idx" ON "a" ("id");',
    'ALTER TABLE "a" ADD COLUMN "note" text;',
    'ALTER TABLE "a" ADD COLUMN "n" integer DEFAULT 0 NOT NULL;',
    'ALTER TABLE "a" ALTER COLUMN "note" DROP NOT NULL;',
    "ALTER TYPE \"kind\" ADD VALUE 'extra';",
    'CREATE TABLE "b" ("id" serial PRIMARY KEY);--> statement-breakpoint\nALTER TABLE "b" ADD CONSTRAINT "fk" FOREIGN KEY ("id") REFERENCES "a"("id");',
  ]) {
    it(`accepts an expand: ${sql.slice(0, 50)}`, () => {
      const { migrate } = drizzle({ sql });
      const run = migrate(["--name", "x"]);
      assert.equal(run.status, 0, run.stderr);
    });
  }

  for (const [why, sql] of [
    ["drops a table", 'DROP TABLE "a";'],
    ["drops a column", 'ALTER TABLE "a" DROP COLUMN "note";'],
    ["renames a column", 'ALTER TABLE "a" RENAME COLUMN "note" TO "memo";'],
    ["renames a table", 'ALTER TABLE "a" RENAME TO "b";'],
    ["adds NOT NULL to a column", 'ALTER TABLE "a" ALTER COLUMN "note" SET NOT NULL;'],
    ["adds a NOT NULL column with no default", 'ALTER TABLE "a" ADD COLUMN "n" integer NOT NULL;'],
    ["changes a column's type", 'ALTER TABLE "a" ALTER COLUMN "n" SET DATA TYPE smallint;'],
    ["drops a type", 'DROP TYPE "kind";'],
    ["rewrites rows", 'UPDATE "a" SET "note" = \'x\';'],
    ["deletes rows", 'DELETE FROM "a";'],
  ]) {
    it(`refuses a contract: it ${why}`, () => {
      const { migrate } = drizzle({ sql });
      const run = migrate(["--name", "x"]);
      assert.equal(run.status, 1);
      assert.equal(run.stdout, "");
      assert.match(run.stderr, /contract/i);
      assert.match(run.stderr, /0001_x/);
      assert.ok(run.stderr.includes(sql.split(";")[0].slice(0, 20)), run.stderr);
    });
  }

  it("leaves what it wrote in place for a person to see when it refuses", () => {
    const { sandboxed, migrate } = drizzle({ sql: 'DROP TABLE "a";' });
    migrate(["--name", "x"]);
    assert.ok(existsSync(sandboxed.path(`${real.dir}/migrations/0001_x.sql`)));
  });

  it("prints nothing and succeeds when the schema has not changed", () => {
    const { migrate } = drizzle({ noop: true });
    const run = migrate(["--name", "x"]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "");
  });

  it("needs a name", () => {
    const { migrate } = drizzle();
    const run = migrate([]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /--name/);
  });

  for (const name of ["add-users", "Add_users", "add users", "../x"]) {
    it(`refuses --name ${JSON.stringify(name)} before drizzle-kit writes anything, saying what a name may hold`, () => {
      const { sandboxed, migrate } = drizzle({ sql: 'CREATE TABLE "b" ("id" serial);\n' });
      const run = migrate(["--name", name]);
      assert.equal(run.status, 2);
      assert.match(run.stderr, /\[a-z0-9_\]/);
      assert.deepEqual(sandboxed.log(), []);
    });
  }

  it("passes --custom on, and says an empty custom file is a person's to check", () => {
    const { sandboxed, migrate } = drizzle({ sql: "" });
    const run = migrate(["--name", "x", "--custom"]);
    assert.equal(run.status, 0, run.stderr);
    assert.ok(sandboxed.log()[0].includes("--custom"));
    assert.match(run.stderr, /custom/i);
  });
});

function ledger() {
  const sandboxed = sandbox();
  const dir = `${real.dir}/migrations`;
  sandboxed.write(`${dir}/meta/_journal.json`, JOURNAL(["0000_start", "0001_more"]));
  sandboxed.write(`${dir}/0000_start.sql`, 'CREATE TABLE "a" ("id" serial);\n');
  sandboxed.write(`${dir}/0001_more.sql`, 'ALTER TABLE "a" ADD COLUMN "n" integer;\n');
  return sandboxed;
}

describe("db postgres-drizzle: pending and apply", () => {
  it("pending prints the query that lists the migrations the ledger lacks, newest last", () => {
    const run = ledger().dispatch(["db", "pending"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /SELECT v\.tag FROM \(VALUES/);
    assert.match(run.stdout, /'0000_start'[\s\S]*'0001_more'/);
    assert.match(run.stdout, /drizzle\.__drizzle_migrations/);
  });

  it("apply prints one transaction holding the file and its ledger row", () => {
    const run = ledger().dispatch(["db", "apply", "0001_more"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^BEGIN;/);
    assert.match(run.stdout, /ALTER TABLE "a" ADD COLUMN "n" integer;/);
    assert.match(run.stdout, /INSERT INTO drizzle\.__drizzle_migrations/);
    assert.match(run.stdout, /COMMIT;\n+$/);
  });

  it("apply --record-only prints the ledger row alone", () => {
    const run = ledger().dispatch(["db", "apply", "0001_more", "--record-only"]);
    assert.equal(run.status, 0, run.stderr);
    assert.doesNotMatch(run.stdout, /ALTER TABLE/);
    assert.match(run.stdout, /INSERT INTO drizzle\.__drizzle_migrations/);
  });

  it("apply refuses a tag the journal does not hold", () => {
    const run = ledger().dispatch(["db", "apply", "0009_nope"]);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /0009_nope/);
  });

  it("reads the migrations directory kitchen.json's settings imply", () => {
    const sandboxed = ledger();
    writeFileSync(sandboxed.path(`${real.dir}/migrations/meta/_journal.json`), JOURNAL(["0000_start"]));
    const run = sandboxed.dispatch(["db", "pending"]);
    assert.doesNotMatch(run.stdout, /0001_more/);
  });
});

describe("db postgres-drizzle: apply holds a file to the expand rule, whoever edited it", () => {
  function edited(sql) {
    const sandboxed = ledger();
    const dir = `${real.dir}/migrations`;
    sandboxed.write(`${dir}/meta/_journal.json`, JOURNAL(["0000_start", "0001_more", "0002_edited"]));
    sandboxed.write(`${dir}/0002_edited.sql`, sql);
    return sandboxed;
  }

  it("refuses a contract, naming the tag and the statement, and prints no SQL for the database", () => {
    const run = edited('ALTER TABLE "a" ADD COLUMN "x" int;\nDROP TABLE "a";').dispatch(["db", "apply", "0002_edited"]);
    assert.equal(run.status, 1);
    assert.equal(run.stdout, "");
    assert.match(run.stderr, /0002_edited/);
    assert.match(run.stderr, /contract/i);
    assert.match(run.stderr, /DROP TABLE "a"/);
  });

  it("refuses a contract a comment hides from a line-by-line reader", () => {
    const run = edited('/* tidy */ DROP TABLE "a";').dispatch(["db", "apply", "0002_edited"]);
    assert.equal(run.status, 1);
    assert.equal(run.stdout, "");
  });

  it("applies an expand as before", () => {
    const run = edited('ALTER TABLE "a" ADD COLUMN "x" int;').dispatch(["db", "apply", "0002_edited"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^BEGIN;/);
  });

  it("prints the ledger row alone for --record-only, since no SQL of the file reaches the database", () => {
    const run = edited('DROP TABLE "a";').dispatch(["db", "apply", "0002_edited", "--record-only"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /INSERT INTO drizzle\.__drizzle_migrations/);
  });

  it("applies a contract only when told it is one, with --allow-contract", () => {
    const run = edited('DROP TABLE "a";').dispatch(["db", "apply", "0002_edited", "--allow-contract"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /DROP TABLE "a";/);
  });

  it("says in its refusal how a contract is applied", () => {
    const run = edited('DROP TABLE "a";').dispatch(["db", "apply", "0002_edited"]);
    assert.match(run.stderr, /--allow-contract/);
    assert.match(run.stderr, /base branch/i);
  });
});
