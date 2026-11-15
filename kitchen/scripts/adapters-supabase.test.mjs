import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { sandbox } from "./adapter-sandbox.mjs";
import { installSupabase, KEYS, startApi } from "./supabase-stub.mjs";

const ADAPTERS = fileURLToPath(new URL("../adapters/", import.meta.url));

const STARTED = "supabase start";
const read = (sandboxed, path) => readFileSync(sandboxed.path(path), "utf8");

function stack({ running = false, settings = {}, env = {} } = {}) {
  const sandboxed = sandbox({ adapters: { stack: { use: "supabase-local", ...settings } } });
  const stub = installSupabase(sandboxed, { running });
  const call = (action, extra = {}) => sandboxed.dispatch(["stack", action], { env: stub.env({ ...env, ...extra }) });
  return { sandboxed, stub, call };
}

describe("stack supabase-local", () => {
  it("up starts a stopped stack and prints API_URL=<the status url> alone, whatever the CLI says on stdout", () => {
    const { sandboxed, call } = stack();
    const run = call("up");
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "API_URL=http://127.0.0.1:54321\n");
    assert.ok(sandboxed.log().includes(STARTED), sandboxed.log().join("\n"));
  });

  it("up leaves a running stack alone: it asks for status and never starts it again", () => {
    const { sandboxed, call } = stack({ running: true });
    const run = call("up");
    assert.equal(run.stdout, "API_URL=http://127.0.0.1:54321\n");
    assert.equal(sandboxed.log().includes(STARTED), false);
  });

  it("up is idempotent across calls", () => {
    const { sandboxed, call } = stack();
    const first = call("up");
    const second = call("up");
    assert.equal(second.stdout, first.stdout);
    assert.equal(sandboxed.log().filter((line) => line === STARTED).length, 1);
  });

  it("up reads the URL the status prints even when its values are not quoted", () => {
    const { call } = stack({ running: true });
    assert.equal(call("up", { STUB_STATUS_UNQUOTED: "1", STUB_API_URL: "http://127.0.0.1:60000" }).stdout, "API_URL=http://127.0.0.1:60000\n");
  });

  it("up records the URL where the drive and the sign-in look for it", () => {
    const { sandboxed, call } = stack();
    call("up");
    assert.equal(read(sandboxed, ".claude/tmp/dev-server.api.url").trim(), "http://127.0.0.1:54321");
  });

  it("up fails with the CLI's own words, and prints nothing, when the stack will not start", () => {
    const { call } = stack();
    const run = call("up", { STUB_START_FAILS: "1" });
    assert.equal(run.status, 1);
    assert.equal(run.stdout, "");
    assert.match(run.stderr, /Docker daemon/);
  });

  it("up says the CLI is missing, and how to name another, when there is none on the path", () => {
    const sandboxed = sandbox({ isolated: true, adapters: { stack: "supabase-local" } });
    const run = sandboxed.dispatch(["stack", "up"]);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /supabase/);
    assert.match(run.stderr, /adapters\.stack\.command/);
  });

  it("up fails when the status has no API_URL, rather than printing an empty one", () => {
    const { sandboxed, stub } = stack({ running: true });
    sandboxed.shim("supabase", '#!/bin/sh\n[ "$1" = status ] && { echo "DB_URL=x"; exit 0; }\nexit 0\n');
    const run = sandboxed.dispatch(["stack", "up"], { env: stub.env() });
    assert.equal(run.status, 1);
    assert.equal(run.stdout, "");
    assert.match(run.stderr, /API_URL/);
  });

  it("prints the publishable key under the name keyEnv gives, and only when it gives one", () => {
    const named = stack({ settings: { keyEnv: "APP_SUPABASE_KEY" }, env: { STUB_NEW_KEYS: "1" } }).call("up");
    assert.equal(named.stdout, `API_URL=http://127.0.0.1:54321\nAPP_SUPABASE_KEY=${KEYS.publishable}\n`);
    const legacy = stack({ settings: { keyEnv: "APP_SUPABASE_KEY" } }).call("up");
    assert.equal(legacy.stdout, `API_URL=http://127.0.0.1:54321\nAPP_SUPABASE_KEY=${KEYS.anon}\n`);
    assert.equal(stack().call("up").stdout, "API_URL=http://127.0.0.1:54321\n");
  });

  it("runs from the directory `dir` names, which holds supabase/", () => {
    const { sandboxed, call } = stack({ settings: { dir: "backend" } });
    sandboxed.write("backend/.keep", "");
    call("up");
    assert.ok(read(sandboxed, "stub.cwd").split("\n").filter(Boolean).every((cwd) => cwd.endsWith("/backend")));
  });

  it("runs the CLI through `command` when it is more than one word", () => {
    const { sandboxed, call } = stack({ settings: { command: "runner supabase" } });
    sandboxed.shim("runner", '#!/bin/sh\necho "runner $1" >>"$STUB_LOG"\nshift\nexec supabase "$@"\n');
    const run = call("up");
    assert.equal(run.status, 0, run.stderr);
    assert.ok(sandboxed.log().includes("runner supabase"));
  });

  it("down stops a running stack, forgets its URL, and is quiet", () => {
    const { sandboxed, call } = stack();
    call("up");
    const run = call("down");
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "");
    assert.ok(sandboxed.log().includes("supabase stop"));
    assert.equal(existsSync(sandboxed.path(".claude/tmp/dev-server.api.url")), false);
  });

  it("down asks the CLI to stop nothing when nothing is running, and is fine with no CLI at all", () => {
    const { sandboxed, call } = stack();
    assert.equal(call("down").status, 0);
    assert.equal(sandboxed.log().includes("supabase stop"), false);
    const bare = sandbox({ isolated: true, adapters: { stack: "supabase-local" } });
    assert.equal(bare.dispatch(["stack", "down"]).status, 0);
  });
});

const MIGRATION = (version, name, sql) => [`supabase/migrations/${version}_${name}.sql`, sql];

function database({ running = false, settings = {}, files = [MIGRATION("20250101000000", "start", "create table a (id serial primary key);\n")] } = {}) {
  const sandboxed = sandbox({ adapters: { db: { use: "supabase-migrations", ...settings } } });
  const stub = installSupabase(sandboxed, { running });
  for (const [path, body] of files) sandboxed.write(path, body);
  const call = (args, extra = {}) => sandboxed.dispatch(["db", ...args], { env: stub.env(extra) });
  return { sandboxed, stub, call };
}

describe("db supabase-migrations: prepare and down", () => {
  it("prepare starts the stack when it is down, then resets the local database to the checkout's migrations", () => {
    const { sandboxed, call } = database();
    const run = call(["prepare"]);
    assert.equal(run.status, 0, run.stderr);
    const log = sandboxed.log().filter((line) => !line.startsWith("supabase status"));
    assert.deepEqual(log, [STARTED, "supabase db reset --local"]);
  });

  it("prepare resets every time, and starts the stack once", () => {
    const { sandboxed, call } = database();
    call(["prepare"]);
    call(["prepare"]);
    const log = sandboxed.log();
    assert.equal(log.filter((line) => line === STARTED).length, 1);
    assert.equal(log.filter((line) => line === "supabase db reset --local").length, 2);
  });

  it("prepare prints nothing on stdout by default, and the database URL under urlEnv when asked", () => {
    assert.equal(database().call(["prepare"]).stdout, "");
    const named = database({ settings: { urlEnv: "APP_DB_URL" } }).call(["prepare"]);
    assert.equal(named.stdout, "APP_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres\n");
  });

  it("prepare fails with the CLI's words when the stack will not start", () => {
    const run = database().call(["prepare"], { STUB_START_FAILS: "1" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Docker daemon/);
  });

  it("prepare runs from the directory `dir` names", () => {
    const { sandboxed, call } = database({ settings: { dir: "backend" } });
    sandboxed.write("backend/.keep", "");
    call(["prepare"]);
    assert.ok(read(sandboxed, "stub.cwd").split("\n").filter(Boolean).every((cwd) => cwd.endsWith("/backend")));
  });

  it("down stops the stack prepare started, and does nothing when it is not running", () => {
    const warm = database({ running: true });
    assert.equal(warm.call(["down"]).status, 0);
    assert.ok(warm.sandboxed.log().includes("supabase stop"));
    const cold = database();
    assert.equal(cold.call(["down"]).status, 0);
    assert.equal(cold.sandboxed.log().includes("supabase stop"), false);
  });
});

describe("db supabase-migrations: migrate", () => {
  it("creates the file with the CLI and prints its tag, <version>_<name>, once", () => {
    const { sandboxed, call } = database();
    const run = call(["migrate", "--name", "add_b"]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "20260101000000_add_b\n");
    assert.ok(sandboxed.log().includes("supabase migration new add_b"));
    assert.ok(existsSync(sandboxed.path("supabase/migrations/20260101000000_add_b.sql")));
  });

  it("copies --sql into the new file, and accepts an expand", () => {
    const { sandboxed, call } = database();
    sandboxed.write("change.sql", "alter table a add column note text;\n");
    const run = call(["migrate", "--name", "add_note", "--sql", sandboxed.path("change.sql")]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(read(sandboxed, "supabase/migrations/20260101000000_add_note.sql"), "alter table a add column note text;\n");
  });

  for (const [why, sql] of [
    ["drops a table", "drop table a;"],
    ["drops a column", "alter table a drop column note;"],
    ["renames a column", "alter table a rename column note to memo;"],
    ["adds NOT NULL", "alter table a alter column note set not null;"],
    ["rewrites rows", "update a set note = 'x';"],
  ]) {
    it(`refuses a contract with the same rule postgres-drizzle holds: it ${why}`, () => {
      const { sandboxed, call } = database();
      sandboxed.write("change.sql", sql);
      const run = call(["migrate", "--name", "x", "--sql", sandboxed.path("change.sql")]);
      assert.equal(run.status, 1);
      assert.equal(run.stdout, "");
      assert.match(run.stderr, /contract/i);
      assert.match(run.stderr, /20260101000000_x/);
      assert.ok(existsSync(sandboxed.path("supabase/migrations/20260101000000_x.sql")), "the file is left for a person to see");
    });
  }

  it("holds only the file it wrote to the rule, not the history that is already applied", () => {
    const { sandboxed, call } = database({ files: [MIGRATION("20240101000000", "old_drop", "drop table gone;\n"), MIGRATION("20250101000000", "start", "create table a (id int);\n")] });
    sandboxed.write("change.sql", "create index a_idx on a (id);");
    assert.equal(call(["migrate", "--name", "idx", "--sql", sandboxed.path("change.sql")]).status, 0);
  });

  it("says an empty file is a person's to check, and prints its tag", () => {
    const run = database().call(["migrate", "--name", "by_hand"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /empty/i);
    assert.match(run.stderr, /--sql/);
    assert.equal(run.stdout, "20260101000000_by_hand\n");
  });

  for (const name of ["add-users", "Add_users", "add users", "../x", "add.users", "añadir"]) {
    it(`refuses --name ${JSON.stringify(name)} before the CLI writes anything, saying what a name may hold`, () => {
      const { sandboxed, call } = database();
      const run = call(["migrate", "--name", name]);
      assert.equal(run.status, 2);
      assert.equal(run.stdout, "");
      assert.match(run.stderr, /\[a-z0-9_\]/);
      assert.ok(run.stderr.includes(name), run.stderr);
      assert.equal(sandboxed.log().some((line) => line.startsWith("supabase migration new")), false);
    });
  }

  it("needs a name, and refuses an argument it does not know", () => {
    const { call } = database();
    const bare = call(["migrate"]);
    assert.equal(bare.status, 2);
    assert.match(bare.stderr, /--name/);
    assert.equal(call(["migrate", "--name", "x", "--frobnicate"]).status, 2);
  });
});

describe("db supabase-migrations: pending and apply", () => {
  const FILES = [
    MIGRATION("20250101000000", "start", "create table a (id serial primary key);\n"),
    MIGRATION("20250202000000", "more", "alter table a add column n integer;\n"),
  ];

  it("pending prints the query that lists the files the ledger lacks, oldest first", () => {
    const { call } = database({ files: FILES });
    const run = call(["pending"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /supabase_migrations\.schema_migrations/);
    assert.match(run.stdout, /'20250101000000_start', '20250101000000'[\s\S]*'20250202000000_more', '20250202000000'/);
    assert.match(run.stdout, /ORDER BY v\.version/);
  });

  it("pending with no migrations prints a query that returns no rows", () => {
    const run = database({ files: [] }).call(["pending"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /WHERE false/i);
  });

  it("apply prints one transaction holding the file and the ledger row, as the CLI writes it", () => {
    const run = database({ files: FILES }).call(["apply", "20250202000000_more"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^BEGIN;/);
    assert.match(run.stdout, /alter table a add column n integer;/);
    assert.match(run.stdout, /INSERT INTO supabase_migrations\.schema_migrations \(version, name, statements\)/);
    assert.match(run.stdout, /'20250202000000', 'more'/);
    assert.match(run.stdout, /ON CONFLICT \(version\) DO NOTHING/);
    assert.match(run.stdout, /COMMIT;\n+$/);
  });

  it("apply does not nest a file that runs its own transaction", () => {
    const { call } = database({ files: [MIGRATION("20250101000000", "own", "BEGIN;\ncreate table a (id int);\nCOMMIT;\n")] });
    const run = call(["apply", "20250101000000_own"]);
    assert.match(run.stdout, /^BEGIN;\ncreate table a \(id int\);\nCOMMIT;\n\nINSERT INTO supabase_migrations/);
    assert.doesNotMatch(run.stdout, /COMMIT;\n+$/);
  });

  it("apply --record-only prints the ledger row alone", () => {
    const run = database({ files: FILES }).call(["apply", "20250202000000_more", "--record-only"]);
    assert.match(run.stdout, /^INSERT INTO supabase_migrations\.schema_migrations/);
    assert.doesNotMatch(run.stdout, /BEGIN;|COMMIT;/);
  });

  it("apply refuses a tag no file holds, and needs one", () => {
    const { call } = database({ files: FILES });
    const missing = call(["apply", "20990101000000_nope"]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /20990101000000_nope/);
    assert.equal(call(["apply"]).status, 1);
  });

  it("reads supabase/migrations under the directory `dir` names", () => {
    const { sandboxed, call } = database({ files: [], settings: { dir: "backend" } });
    sandboxed.write("backend/supabase/migrations/20250101000000_start.sql", "create table a (id int);\n");
    assert.match(call(["pending"]).stdout, /20250101000000_start/);
  });

  describe("apply holds a file to the expand rule, whoever edited it", () => {
    const edited = (sql) => database({ files: [...FILES, MIGRATION("20250303000000", "edited", sql)] });

    it("refuses a contract, naming the tag and the statement, and prints no SQL for the database", () => {
      const run = edited("alter table a add column x int;\ndrop table a;").call(["apply", "20250303000000_edited"]);
      assert.equal(run.status, 1);
      assert.equal(run.stdout, "");
      assert.match(run.stderr, /20250303000000_edited/);
      assert.match(run.stderr, /contract/i);
      assert.match(run.stderr, /drop table a/);
    });

    it("refuses a contract a comment hides from a line-by-line reader", () => {
      const run = edited("/* tidy */ drop table a;").call(["apply", "20250303000000_edited"]);
      assert.equal(run.status, 1);
      assert.equal(run.stdout, "");
    });

    it("prints the ledger row alone for --record-only, since no SQL of the file reaches the database", () => {
      const run = edited("drop table a;").call(["apply", "20250303000000_edited", "--record-only"]);
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /^INSERT INTO supabase_migrations\.schema_migrations/);
    });

    it("applies a contract only when told it is one, with --allow-contract", () => {
      const run = edited("drop table a;").call(["apply", "20250303000000_edited", "--allow-contract"]);
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /drop table a;/);
    });

    it("says in its refusal how a contract is applied", () => {
      const run = edited("drop table a;").call(["apply", "20250303000000_edited"]);
      assert.match(run.stderr, /--allow-contract/);
      assert.match(run.stderr, /base branch/i);
    });
  });

  it("refuses a file whose name is not <14 digits>_<name>.sql, rather than guess its version", () => {
    const run = database({ files: [["supabase/migrations/notes.sql", "select 1;"]] }).call(["pending"]);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /notes/);
  });
});

const PASSWORD = "pw-from-fixture";

describe("auth supabase-auth", () => {
  let api;

  before(async () => {
    api = await startApi();
  });

  after(() => api.close());

  function project({ settings = {}, running = true, env = {} } = {}) {
    api.seen.length = 0;
    api.users.clear();
    const sandboxed = sandbox({ adapters: { auth: { use: "supabase-auth", ...settings } } });
    const stub = installSupabase(sandboxed, { running });
    const environment = (extra = {}) => stub.env({ STUB_API_URL: api.url, ...env, ...extra });
    return {
      sandboxed,
      seed: (extra) => sandboxed.dispatchAsync(["auth", "seed"], { env: environment(extra) }),
      bare: (args = [], extra) => sandboxed.dispatchAsync(["auth", "sign-in", ...args], { env: environment(extra) }),
      signIn: (args = [], extra) => sandboxed.dispatchAsync(["auth", "sign-in", "--app-url", "http://localhost:8081", ...args], { env: environment(extra) }),
    };
  }

  describe("seed", () => {
    it("creates the dev user through the admin API with the service-role key, confirmed", async () => {
      const { seed } = project();
      const run = await seed();
      assert.equal(run.status, 0, run.stderr);
      const [create] = api.seen;
      assert.equal(create.path, "/auth/v1/admin/users");
      assert.equal(create.headers.apikey, KEYS.service);
      assert.equal(create.headers.authorization, `Bearer ${KEYS.service}`);
      assert.deepEqual(create.body, { email: "dev@example.test", password: "dev-password", email_confirm: true });
    });

    it("writes .claude/tmp/dev-user.json with what it created, and prints nothing", async () => {
      const { sandboxed, seed } = project();
      const run = await seed();
      assert.equal(run.stdout, "");
      assert.deepEqual(JSON.parse(read(sandboxed, ".claude/tmp/dev-user.json")), { email: "dev@example.test", password: "dev-password" });
    });

    it("takes the account from the fixture the settings name, and a password from the environment over it", async () => {
      const { sandboxed, seed } = project({ settings: { fixture: "fixtures/dev-user.json" } });
      sandboxed.write("fixtures/dev-user.json", JSON.stringify({ email: "dev@fixture.test", password: PASSWORD }));
      await seed();
      assert.deepEqual(JSON.parse(read(sandboxed, ".claude/tmp/dev-user.json")), { email: "dev@fixture.test", password: PASSWORD });
      await seed({ AUTH_DEV_LOGIN_PASSWORD: "override" });
      assert.equal(JSON.parse(read(sandboxed, ".claude/tmp/dev-user.json")).password, "override");
    });

    it("follows a per-run suffix, as the other auth adapter's seed does", async () => {
      const { sandboxed, seed } = project();
      await seed({ DEV_SEED_SUFFIX: "18342" });
      assert.equal(JSON.parse(read(sandboxed, ".claude/tmp/dev-user.json")).email, "dev+18342@example.test");
    });

    it("is idempotent: an account that exists is found and its password set to the one written", async () => {
      const { sandboxed, seed } = project();
      await seed();
      const again = await seed({ AUTH_DEV_LOGIN_PASSWORD: "changed" });
      assert.equal(again.status, 0, again.stderr);
      assert.equal(api.users.size, 1);
      assert.equal([...api.users.values()][0].password, "changed");
      assert.equal(JSON.parse(read(sandboxed, ".claude/tmp/dev-user.json")).password, "changed");
    });

    it("uses a secret key as the apikey alone, since only the gateway can turn it into a token", async () => {
      const { seed } = project({ env: { STUB_ONLY_NEW_KEYS: "1" } });
      const run = await seed();
      assert.equal(run.status, 0, run.stderr);
      assert.equal(api.seen[0].headers.apikey, KEYS.secret);
      assert.equal(api.seen[0].headers.authorization, undefined);
    });

    it("starts the stack when it is down, then creates the user, whatever the db adapter is", async () => {
      const { sandboxed, seed } = project({ running: false });
      const run = await seed();
      assert.equal(run.status, 0, run.stderr);
      assert.ok(sandboxed.log().includes("supabase start"), sandboxed.log().join("\n"));
      assert.equal(api.seen[0].path, "/auth/v1/admin/users");
      assert.equal(run.stdout, "");
    });

    it("leaves a stack that is running alone", async () => {
      const { sandboxed, seed } = project();
      assert.equal((await seed()).status, 0);
      assert.equal(sandboxed.log().includes("supabase start"), false);
    });

    it("starts the stack once however many times it runs", async () => {
      const { sandboxed, seed } = project({ running: false });
      await seed();
      await seed();
      assert.equal(sandboxed.log().filter((line) => line === "supabase start").length, 1);
    });

    it("fails with the CLI's own words, and writes no account, when the stack will not start", async () => {
      const { sandboxed, seed } = project({ running: false });
      const run = await seed({ STUB_START_FAILS: "1" });
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /Docker daemon/);
      assert.equal(existsSync(sandboxed.path(".claude/tmp/dev-user.json")), false);
    });

    it("says the CLI is missing, and how to name another, when there is none on the path", async () => {
      const sandboxed = sandbox({ isolated: true, adapters: { auth: "supabase-auth" } });
      const run = await sandboxed.dispatchAsync(["auth", "seed"]);
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /adapters\.auth\.command/);
    });

    it("fails with the API's refusal when the key is not allowed to create users", async () => {
      const { sandboxed, seed } = project({ env: { STUB_STATUS_UNQUOTED: "1" } });
      sandboxed.shim("supabase", `#!/bin/sh\necho API_URL=${api.url}\necho SERVICE_ROLE_KEY=${KEYS.anon}\n`);
      const run = await seed();
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /403/);
    });
  });

  describe("sign-in", () => {
    const seeded = async (settings) => {
      const made = project({ settings });
      await made.seed();
      return made;
    };
    const stateIn = (sandboxed, path = ".claude/tmp/auth.json") => JSON.parse(read(sandboxed, path));

    it("posts the password grant with the anon key and writes the session under sb-<ref>-auth-token for the app's origin", async () => {
      const { sandboxed, signIn } = await seeded();
      api.seen.length = 0;
      const run = await signIn();
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout.trim(), sandboxed.path(".claude/tmp/auth.json"));
      const [grant] = api.seen;
      assert.equal(grant.path, "/auth/v1/token");
      assert.equal(grant.query, "?grant_type=password");
      assert.equal(grant.headers.apikey, KEYS.anon);
      assert.deepEqual(grant.body, { email: "dev@example.test", password: "dev-password" });
      const state = stateIn(sandboxed);
      assert.deepEqual(state.cookies, []);
      assert.equal(state.origins.length, 1);
      assert.equal(state.origins[0].origin, "http://localhost:8081");
      assert.deepEqual(state.origins[0].localStorage.map((entry) => entry.name), ["sb-127-auth-token"]);
      const session = JSON.parse(state.origins[0].localStorage[0].value);
      assert.equal(session.access_token, "access-for-id-1");
      assert.equal(session.refresh_token, "refresh-1");
      assert.equal(session.token_type, "bearer");
      assert.equal(session.user.email, "dev@example.test");
      assert.equal(typeof session.expires_at, "number");
    });

    it("prefers the publishable key to the anon one when the CLI has both", async () => {
      const { signIn, seed } = project({ env: { STUB_NEW_KEYS: "1" } });
      await seed();
      api.seen.length = 0;
      await signIn();
      assert.equal(api.seen[0].headers.apikey, KEYS.publishable);
    });

    it("derives the key from the API host the way supabase-js does: its first label", async () => {
      const { sandboxed, signIn, seed } = project();
      await seed();
      const run = await signIn(["--api-url", api.url.replace("127.0.0.1", "localhost")]);
      assert.equal(run.status, 0, run.stderr);
      assert.deepEqual(stateIn(sandboxed).origins[0].localStorage.map((entry) => entry.name), ["sb-localhost-auth-token"]);
    });

    it("verifies the token against /auth/v1/user before it saves anything", async () => {
      const { signIn, seed } = project();
      await seed();
      api.seen.length = 0;
      await signIn();
      const check = api.seen.find((request) => request.path === "/auth/v1/user");
      assert.equal(check.headers.authorization, "Bearer access-for-id-1");
    });

    it("takes the app's origin from the dev server the core recorded when --app-url is not given, dropping the path", async () => {
      const { sandboxed, seed, bare } = project();
      await seed();
      sandboxed.write(".claude/tmp/dev-server.url", "http://localhost:8099/some/path\n");
      const run = await bare();
      assert.equal(run.status, 0, run.stderr);
      assert.equal(stateIn(sandboxed).origins[0].origin, "http://localhost:8099");
    });

    it("says it has no app origin when neither --app-url nor a recorded dev server gives one", async () => {
      const { sandboxed, seed, bare } = project();
      await seed();
      const run = await bare();
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /--app-url/);
      assert.equal(existsSync(sandboxed.path(".claude/tmp/auth.json")), false);
    });

    it("finds the API where the stack recorded it, ahead of asking the CLI", async () => {
      const { sandboxed, seed, signIn } = project();
      await seed();
      sandboxed.write(".claude/tmp/dev-server.api.url", `${api.url}\n`);
      sandboxed.shim("supabase", `#!/bin/sh\necho "supabase $*" >>"$STUB_LOG"\necho ANON_KEY=${KEYS.anon}\n`);
      const run = await signIn();
      assert.equal(run.status, 0, run.stderr);
    });

    it("signs in as the account the seed wrote, and as --email when given, with the environment's credentials over both", async () => {
      const { sandboxed, signIn, seed } = project();
      await seed({ AUTH_DEV_LOGIN_PASSWORD: "pw-1" });
      api.seen.length = 0;
      await signIn(["--email", "dev@example.test"], { AUTH_DEV_LOGIN_PASSWORD: "pw-1" });
      assert.deepEqual(api.seen[0].body, { email: "dev@example.test", password: "pw-1" });
      const out = sandboxed.path("second.json");
      const run = await signIn(["--out", out], { AUTH_DEV_LOGIN_PASSWORD: "pw-1" });
      assert.equal(run.stdout.trim(), out);
      assert.ok(existsSync(out));
    });

    it("reports a refused sign-in with its status and body, saving nothing", async () => {
      const { sandboxed, signIn, seed } = project();
      await seed();
      const run = await signIn([], { AUTH_DEV_LOGIN_PASSWORD: "wrong" });
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /sign-in failed with 400/);
      assert.match(run.stderr, /Invalid login credentials/);
      assert.equal(existsSync(sandboxed.path(".claude/tmp/auth.json")), false);
    });

    it("tells the person to seed when there is no account to sign in as", async () => {
      const { signIn } = project();
      const run = await signIn();
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /seed/);
    });
  });

});

describe("the storage key", () => {
  it("is sb-<first label of the API host>-auth-token", async () => {
    const { storageKey } = await import(join(ADAPTERS, "auth/supabase-auth/storage-key.mjs"));
    assert.equal(storageKey("http://127.0.0.1:54321"), "sb-127-auth-token");
    assert.equal(storageKey("http://localhost:54321"), "sb-localhost-auth-token");
    assert.equal(storageKey("https://abcdefgh.supabase.co"), "sb-abcdefgh-auth-token");
    assert.equal(storageKey("https://abcdefgh.supabase.co/"), "sb-abcdefgh-auth-token");
  });
});
