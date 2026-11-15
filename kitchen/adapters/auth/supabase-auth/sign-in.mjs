// Signs the dev account in with the password grant and writes the session where supabase-js looks
// for it: a localStorage entry under `sb-<ref>-auth-token` for the app's origin, in a Playwright
// storageState. There are no cookies, so unlike a cookie session it does not care what host the app
// is served from, only that the key matches the API URL the app was given.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { fail, fixtureCredentials, readIfPresent, STATE_DIR, stackStatus } from "./common.mjs";
import { storageKey } from "./storage-key.mjs";

function parseArgs(argv) {
  const args = { out: join(STATE_DIR, "auth.json") };
  const flags = { "--api-url": "apiUrl", "--app-url": "appUrl", "--out": "out", "--email": "email" };
  for (let i = 0; i < argv.length; i++) {
    const key = flags[argv[i]];
    if (!key) {
      console.error(`unknown argument: ${argv[i]}\nusage: adapter.mjs auth sign-in [--email <e>] [--api-url <u>] [--app-url <u>] [--out <path>]`);
      process.exit(2);
    }
    args[key] = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const appUrl = args.appUrl ?? (await readIfPresent(join(STATE_DIR, "dev-server.url")))?.trim();
if (!appUrl) fail("no app origin to save the session for: pass --app-url, or start the dev server, which records its URL");
const origin = new URL(appUrl).origin;

const status = stackStatus();
const recorded = (await readIfPresent(join(STATE_DIR, "dev-server.api.url")))?.trim();
const apiUrl = (args.apiUrl ?? recorded ?? status.API_URL ?? "").replace(/\/$/, "");
const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
if (!apiUrl || !key) fail("no API URL, or neither PUBLISHABLE_KEY nor ANON_KEY in `status` to sign in with");

const seeded = JSON.parse((await readIfPresent(join(STATE_DIR, "dev-user.json"))) ?? "{}");
const fixture = await fixtureCredentials();
const email = args.email ?? process.env.AUTH_DEV_LOGIN_EMAIL ?? seeded.email ?? fixture.email;
const password = process.env.AUTH_DEV_LOGIN_PASSWORD ?? seeded.password ?? fixture.password;
if (!email || !password) fail("no credentials: run `auth seed` first, or set adapters.auth.fixture to a file holding an email and a password");

const grant = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: key },
  body: JSON.stringify({ email, password }),
});
const body = await grant.text();
if (!grant.ok) fail(`sign-in failed with ${grant.status}: ${body.slice(0, 400)}`);
const session = JSON.parse(body);
session.expires_at ??= Math.floor(Date.now() / 1000) + session.expires_in;

const check = await fetch(`${apiUrl}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${session.access_token}` } });
if (!check.ok) fail(`the session does not resolve to a user; /auth/v1/user answered ${check.status}`);

const state = { cookies: [], origins: [{ origin, localStorage: [{ name: storageKey(apiUrl), value: JSON.stringify(session) }] }] };
await mkdir(dirname(args.out), { recursive: true });
await writeFile(args.out, `${JSON.stringify(state, null, 2)}\n`);

console.log(args.out);
