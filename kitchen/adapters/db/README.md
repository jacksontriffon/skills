# Adapters for the db slot

`db/<name>/<action>` is one executable per action, and `adapters.db.use` in
[`kitchen.json`](../../../kitchen.json) names the `<name>`.

```
node .claude/kitchen/scripts/adapter.mjs db prepare
node .claude/kitchen/scripts/adapter.mjs db migrate --name <what_it_does>
```

| Action    | Does                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `prepare` | brings a container-local database to the schema in the checkout, and prints `NAME=value` for what must be exported |
| `down`    | stops what `prepare` started, and is fine when there is nothing to stop                                       |
| `migrate` | writes a migration and prints its tag, or prints nothing when there is nothing to write. Exits 1, leaving the files where they were written, when the migration is not an expand: any `DROP`, a rename, a `NOT NULL` added to a column that exists, a type change, a `DO` block, or a rewrite of rows. Needs `--name`, which holds `[a-z0-9_]` and nothing else, since the tag it makes is read back by `pending` |
| `pending` | prints the SQL that lists the migrations the database's ledger lacks, for whatever the agent can run SQL through |
| `apply`   | `apply <tag> [--record-only \| --allow-contract]` prints the SQL that applies one migration and records it, in one transaction. Exits 1, printing nothing for the database, when the file is not an expand, since the file is what reaches the shared database whoever last edited it |

`prepare` prints only `NAME=value` lines on stdout: the caller exports them to everything it starts
after, because the container's own database URL is one its proxy refuses. [`session-up.sh`](../../scripts/session-up.sh)
does that. It refuses, and fails the step, a line that names `PATH`, `BASH_ENV`, `ENV`, `NODE_OPTIONS`, `IFS`, `SHELL`,
`HOME`, `UID`, `EUID`, `PPID`, `SHELLOPTS`, `BASHOPTS`, or anything starting `LD_` or `DYLD_`: those are read-only or change how
every later command runs. [`dev-server.sh`](../../scripts/dev-server.sh) holds `stack up`'s lines to the same list.

An agent container cannot reach a hosted database, so `pending` and `apply` print SQL instead of
running it: the agent runs it through the database connector it has.

## postgres-drizzle

A Postgres cluster in the container, and a Drizzle schema pushed to it.

| Setting      | Meaning                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| `dir`        | the package that holds the Drizzle config, from the repo root                |
| `database`   | the local database to create. `app` if absent                                |
| `version`    | the Postgres major version to install and start. 16 if absent                |
| `migrations` | the migrations directory, from the repo root. `<dir>/migrations` if absent   |

[`expand.mjs`](expand.mjs) is the expand-only rule. Every adapter that writes a migration runs it in `migrate`, and
every adapter that prints one for the shared database runs it again in `apply`.

It reads the SQL as SQL: comments, string literals, quoted identifiers and dollar-quoted bodies are blanked before
anything is matched, so `/* c */ DROP TABLE t` is a drop and a string that says "DELETE" is not. It refuses, per
statement, and per comma-separated clause of an `ALTER TABLE`:

- any statement that begins with `DROP`, and an `ALTER TABLE` clause that begins with `DROP`, with or without `COLUMN`.
  Dropping `NOT NULL`, a default or an identity is an `ALTER COLUMN` clause and passes
- `RENAME` anywhere
- `ALTER [COLUMN] x TYPE …` and `SET DATA TYPE`, and `SET NOT NULL`
- an `ADD [COLUMN]` that is `NOT NULL` with no `DEFAULT`, serial or generated column, judged on its own clause
- `DELETE`, `UPDATE` and `TRUNCATE` anywhere, which covers a `WITH … DELETE … RETURNING`. The referential
  `ON DELETE` and `ON UPDATE` of a foreign key, and a trigger, policy, rule or grant that names the event, are not rewrites
- a `DO` block, whose body this cannot read: write its statements out, each one an expand

What it cannot see is a function that does the damage when called (`SELECT drop_everything()`).

`apply` takes `--record-only`, which prints the ledger row and none of the file, and so is not checked. A contract
is applied from the base branch, once the code stops reading the old shape, with `--allow-contract`.

## none

A project with no database. Every action exits 0 and prints nothing on stdout. `migrate` says on
stderr, `adapters.db is none: nothing to migrate`, so an agent that asked for a migration reads why no tag
came back. It takes any arguments, `--name` included or not.

## supabase-migrations

The local Supabase stack's database, built from `supabase/migrations/*.sql`.

| Setting  | Meaning                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------- |
| `dir`    | the directory that holds `supabase/`, from the repo root. The root if absent                        |
| `command`| how to run the CLI. `supabase` if absent                                                            |
| `urlEnv` | a name to print the database URL under, for a server that connects to it. Nothing is printed if absent |

`prepare` starts the stack if it is down and runs `supabase db reset --local`, which rebuilds the database
from the checkout's migrations every time. `migration up` would only add: it refuses a ledger that holds a
migration the checkout lacks, which is what a Before checkout is. `down` stops the stack, and does nothing
when it is not running.

`migrate --name <n> [--sql <file>]` runs `supabase migration new <n>`, copies the file into it when given,
and runs the same expand rule. There is no schema to diff, so the SQL is the agent's: without `--sql` the
file is empty, which is said on stderr, and a file edited by hand afterwards is held to the rule by nothing.
It prints the tag, `<14-digit version>_<name>`.

`pending` and `apply <tag> [--record-only]` print SQL for the Supabase MCP's `execute_sql`, against
`supabase_migrations.schema_migrations`, whose rows are `version`, `name` and `statements`. `apply` writes the
file's own version, which the MCP's `apply_migration` would not: it stamps the time it ran, so the CLI would
see the file as unapplied and run it again. `statements` holds the whole file as one element. A file whose
name is not `<14 digits>_<name>.sql` is refused. `pending` needs the ledger to exist, which the first
`supabase db push` or `migration up` creates.

[`adapters-db.test.mjs`](../../scripts/adapters-db.test.mjs) runs `prepare` and `down` against shims
for `apt-get`, `pg_ctlcluster`, `su` and the package manager, and `migrate`, `pending` and `apply`
against a fixture migrations directory. What it cannot show is a real cluster accepting the
password and the push: that needs a container that can install Postgres, and `session-up.sh up` is
that run. [`adapters-supabase.test.mjs`](../../scripts/adapters-supabase.test.mjs) does the same for
`supabase-migrations` against a shim for the CLI; a real `db reset` and the ledger's real columns need a
running stack.
