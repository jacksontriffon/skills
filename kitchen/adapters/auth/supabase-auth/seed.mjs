// Creates the dev account through the admin API and records it in .claude/tmp/dev-user.json,
// which `sign-in` signs in with. An account that exists is found and given the password written.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { adminHeaders, fail, fixtureCredentials, STATE_DIR, stackStatus } from "./common.mjs";

const PER_PAGE = 1000;

const status = stackStatus();
const apiUrl = status.API_URL?.replace(/\/$/, "");
const key = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
if (!apiUrl || !key) fail("`status` printed no API_URL, or neither SERVICE_ROLE_KEY nor SECRET_KEY");

const fixture = await fixtureCredentials();
const [local, domain] = (fixture.email ?? "dev@example.test").split("@");
const suffix = process.env.DEV_SEED_SUFFIX;
const email = suffix ? `${local}+${suffix}@${domain}` : `${local}@${domain}`;
const password = process.env.AUTH_DEV_LOGIN_PASSWORD || fixture.password || "dev-password";

async function call(method, path, body) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/${path}`, { method, headers: adminHeaders(key), body: body && JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, text, json: (() => { try { return JSON.parse(text); } catch { return {}; } })() };
}

const created = await call("POST", "users", { email, password, email_confirm: true });
if (created.status >= 400 && created.json.error_code !== "email_exists") {
  fail(`creating ${email} failed with ${created.status}: ${created.text.slice(0, 400)}`);
}

if (created.status >= 400) {
  let existing;
  for (let page = 1; !existing; page++) {
    const listed = await call("GET", `users?page=${page}&per_page=${PER_PAGE}`);
    if (listed.status >= 400) fail(`listing users failed with ${listed.status}: ${listed.text.slice(0, 400)}`);
    const users = listed.json.users ?? [];
    existing = users.find((user) => user.email === email);
    if (users.length < PER_PAGE) break;
  }
  if (!existing) fail(`${email} exists but is not in the user list`);
  const updated = await call("PUT", `users/${existing.id}`, { password, email_confirm: true });
  if (updated.status >= 400) fail(`setting ${email}'s password failed with ${updated.status}: ${updated.text.slice(0, 400)}`);
}

await mkdir(STATE_DIR, { recursive: true });
await writeFile(join(STATE_DIR, "dev-user.json"), `${JSON.stringify({ email, password }, null, 2)}\n`);
