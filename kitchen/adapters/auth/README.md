# Adapters for the auth slot

`auth/<name>/<action>` is one executable per action, and `adapters.auth.use` in
[`kitchen.json`](../../../kitchen.json) names the `<name>`.

```
node .claude/kitchen/scripts/adapter.mjs auth seed
node .claude/kitchen/scripts/adapter.mjs auth sign-in [--email <e>] [--api-url <u>] [--out <path>]
```

| Action    | Does                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| `seed`    | seeds the dev account, writes `.claude/tmp/dev-user.json` (`{ "email", "password" }`), prints `NAME=value` for what the servers need, if any |
| `sign-in` | signs the account in against the running API, and writes a Playwright storageState to `.claude/tmp/auth.json` (or `--out`), printing its path. The state holds the session as cookies, as local storage under an origin, or as neither, for an app with no accounts |

`sign-in` takes its credentials from, in order, `--email`, `AUTH_DEV_LOGIN_EMAIL` and
`AUTH_DEV_LOGIN_PASSWORD`, `dev-user.json`, then the fixture. It finds the API from `--api-url`, or
where [`stack`](../stack/README.md) recorded it, or on port 3000. It verifies the cookie resolves to
a session before it saves anything, so a state file that exists is one that works. `--app-url` is
refused when its host differs from the API's, since a cookie is not sent across hosts.

[`drive.mjs`](../../scripts/drive.mjs) runs `sign-in` for a flow's `signInAs`, into a file of its own,
and loads the cookies into the browser context, and the local storage into it before the page's scripts run.
Every `sign-in` takes `--email`, `--api-url`, `--app-url` and `--out`, and an adapter that has no use for
one ignores it.

## better-auth

Email-and-password sign-in that the auth package registers only when `AUTH_DEV_LOGIN` is on.

| Setting      | Meaning                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------- |
| `seedScript` | the package script that seeds the account. It prints the account's email when given `--email` |
| `fixture`    | a JSON file holding the account's `email` and `password`, from the repo root                  |

[`adapters-auth.test.mjs`](../../scripts/adapters-auth.test.mjs) runs `seed` against a shim for the
package manager and `sign-in` against a local HTTP server that answers like the API. What it cannot
show is the real auth package accepting the credentials: that needs the API running against a
database, which `session-up.sh up` brings.

## none

An app with no accounts. `seed` does nothing and prints nothing. `sign-in` writes the state of nobody, a
Playwright storageState that parses and holds nothing, so what loads a state file still finds one:

```json
{
  "cookies": [],
  "origins": []
}
```

A flow tagged `signed-in` is refused against it, by what reads the state, as signed out: [`drive.mjs`](../../scripts/drive.mjs)
calls a state signed in when it holds any cookie, or any local storage entry under the app's origin, and asks nothing about what
the adapter named it.

## supabase-auth

The local stack's own auth, which the app's `supabase-js` client signs in to.

| Setting   | Meaning                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------- |
| `dir`     | the directory that holds `supabase/`, from the repo root. The root if absent                         |
| `command` | how to run the CLI. `supabase` if absent                                                             |
| `fixture` | a JSON file holding the account's `email` and `password`, from the repo root. `dev@example.test` and `dev-password` if absent |

`seed` reads the URL and the service-role key from `supabase status -o env` (`SECRET_KEY` on a CLI that has
no service-role one), creates the account through the admin API already confirmed, and writes
`dev-user.json`. An account that exists is found, and given the password written. It follows
`DEV_SEED_SUFFIX` (`dev+<suffix>@…`) and `AUTH_DEV_LOGIN_PASSWORD`. It starts the stack itself when `status` says it is
down, and leaves a running one alone, so it works whatever `adapters.db` is: only `supabase-migrations` starts the stack
before it. A stack that will not start fails the seed with the CLI's own words.

`sign-in` posts the password grant to `<api>/auth/v1/token?grant_type=password` with the publishable key
(the anon key on a CLI with no publishable one), checks the token against `/auth/v1/user`, and writes the
session JSON into the state as a localStorage entry on the app's origin. The origin is `--app-url`, or the
URL the dev server recorded. The key is `sb-<first label of the API host>-auth-token`, which is how
`supabase-js` names it: `http://127.0.0.1:54321` gives `sb-127-auth-token`, so it matches only when the
`--api-url` is the URL the app was started with, which the stack recorded and `sign-in` reads when it is
not given one. There are no cookies, so unlike the other adapter it does not care what host the app is on.

[`adapters-supabase.test.mjs`](../../scripts/adapters-supabase.test.mjs) runs both against a shim for the
CLI and a local server that answers the slice of the auth API they use. What it cannot show is the real
auth service accepting the requests, and the app's client finding the session under that key on load: both
need a running stack and the app.

