// The email-and-password client plugin returns early on web, so there the session travels as an
// ordinary browser cookie rather than through the native store. Cookie scope ignores the port,
// so one cookie on `localhost` covers Metro's origin and the API's — which is why --app-url is
// checked against --api-url by host and not by URL.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const given = process.env.KITCHEN_ADAPTER;
if (!given) {
  console.error("run this through .claude/kitchen/scripts/adapter.mjs, which hands it kitchen.json's settings");
  process.exit(1);
}
const { settings, root } = JSON.parse(given);
const STATE_DIR = join(root, ".claude/tmp");

function fail(message) {
  console.error(`better-auth sign-in: ${message}`);
  process.exit(1);
}

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

async function readIfPresent(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function resolveApiUrl(fromArgs) {
  if (fromArgs) return fromArgs.replace(/\/$/, "");
  const recorded = await readIfPresent(join(STATE_DIR, "dev-server.api.url"));
  return (recorded?.trim() || "http://localhost:3000").replace(/\/$/, "");
}

async function readCredentials(emailFromArgs) {
  const seeded = await readIfPresent(join(STATE_DIR, "dev-user.json"));
  const fixture = settings.fixture ? await readIfPresent(join(root, settings.fixture)) : undefined;
  const known = JSON.parse(seeded ?? fixture ?? "{}");
  const email = emailFromArgs ?? process.env.AUTH_DEV_LOGIN_EMAIL ?? known.email;
  const password = process.env.AUTH_DEV_LOGIN_PASSWORD ?? known.password;
  if (!email || !password) {
    fail("no credentials: run `auth seed` first, or set adapters.auth.fixture to a file holding an email and a password");
  }
  return { email, password };
}

function toStorageStateCookie(setCookie, domain) {
  const [pair, ...attributes] = setCookie.split(";").map((p) => p.trim());
  const separator = pair.indexOf("=");
  const cookie = {
    name: pair.slice(0, separator),
    value: decodeURIComponent(pair.slice(separator + 1)),
    domain,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  };
  for (const attribute of attributes) {
    const at = attribute.indexOf("=");
    const name = (at === -1 ? attribute : attribute.slice(0, at)).toLowerCase();
    const value = at === -1 ? "" : attribute.slice(at + 1);
    if (name === "path") cookie.path = value;
    else if (name === "domain") cookie.domain = value.replace(/^\./, "");
    else if (name === "httponly") cookie.httpOnly = true;
    else if (name === "secure") cookie.secure = true;
    else if (name === "max-age") cookie.expires = Math.floor(Date.now() / 1000) + Number(value);
    else if (name === "expires" && cookie.expires === -1) cookie.expires = Math.floor(new Date(value).getTime() / 1000);
    else if (name === "samesite") cookie.sameSite = value.charAt(0).toUpperCase() + value.slice(1);
  }
  return cookie;
}

const args = parseArgs(process.argv.slice(2));
const apiUrl = await resolveApiUrl(args.apiUrl);
const apiHost = new URL(apiUrl).hostname;

if (args.appUrl && new URL(args.appUrl).hostname !== apiHost) {
  fail(
    `--app-url host ${new URL(args.appUrl).hostname} differs from --api-url host ${apiHost}; a cookie set for one ` +
      `will not be sent from the other. Serve both from the same host, or sign in through the browser instead.`,
  );
}

const { email, password } = await readCredentials(args.email);

const signIn = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});

if (!signIn.ok) {
  const body = await signIn.text();
  fail(
    body.includes("EMAIL_AND_PASSWORD_IS_NOT_ENABLED")
      ? `${apiUrl} has no headless sign-in path. Start the server with AUTH_DEV_LOGIN=1, and check its log for a line saying the path was refused.`
      : `sign-in failed with ${signIn.status}: ${body.slice(0, 400)}`,
  );
}

const setCookies = signIn.headers.getSetCookie();
if (setCookies.length === 0) fail("sign-in succeeded but set no cookie; nothing to save.");

const cookies = setCookies.map((setCookie) => toStorageStateCookie(setCookie, apiHost));
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

const session = await fetch(`${apiUrl}/api/auth/get-session`, { headers: { cookie: cookieHeader } });
const sessionBody = await session.json().catch(() => null);
if (!sessionBody?.user) {
  fail(`the saved cookie does not resolve to a session; get-session answered ${session.status} ${JSON.stringify(sessionBody).slice(0, 200)}`);
}

await mkdir(dirname(args.out), { recursive: true });
await writeFile(args.out, `${JSON.stringify({ cookies, origins: [] }, null, 2)}\n`);

console.log(args.out);
