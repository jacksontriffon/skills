import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { cliWords, readStatus } from "../../supabase-status.mjs";

const given = process.env.KITCHEN_ADAPTER;
if (!given) {
  console.error("run this through .claude/kitchen/scripts/adapter.mjs, which hands it kitchen.json's settings");
  process.exit(1);
}

export const { settings, root } = JSON.parse(given);
export const STATE_DIR = join(root, ".claude/tmp");

export function fail(message) {
  console.error(`auth: ${message}`);
  process.exit(1);
}

export async function readIfPresent(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

export function stackStatus() {
  const status = readStatus({ settings, root });
  if (!status) {
    fail(`the local stack is not running, or \`${cliWords(settings).join(" ")} status\` cannot be asked: bring it up with \`adapter.mjs stack up\` first`);
  }
  return status;
}

// A secret key is a gateway key rather than a token, so it goes in `apikey` alone; a service-role
// JWT is also the bearer the admin API checks.
export function adminHeaders(key) {
  return { "content-type": "application/json", apikey: key, ...(key.startsWith("eyJ") ? { authorization: `Bearer ${key}` } : {}) };
}

export async function fixtureCredentials() {
  const text = settings.fixture ? await readIfPresent(join(root, settings.fixture)) : undefined;
  return JSON.parse(text ?? "{}");
}
