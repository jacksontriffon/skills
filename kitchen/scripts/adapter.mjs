import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CONFIG, load } from "./kitchen.mjs";

export const CONTRACT = {
  stack: ["up", "down"],
  db: ["prepare", "down", "migrate", "pending", "apply"],
  auth: ["seed", "sign-in"],
  errors: ["top", "search"],
  evidenceHost: ["push"],
};

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const ADAPTERS = new URL("../adapters/", import.meta.url);

export function adapterFile(slot, use, action) {
  return fileURLToPath(new URL(`${slot}/${use}/${action}`, ADAPTERS));
}

function usage(message) {
  process.stderr.write(`${message}\nusage: adapter.mjs <slot> <action> [args]\n`);
  process.exit(2);
}

function main([slot, action, ...args]) {
  if (!slot || !action) usage("a slot and an action are required");
  if (!(slot in CONTRACT)) usage(`${slot} is not a slot with a contract: ${Object.keys(CONTRACT).join(", ")}`);
  if (!CONTRACT[slot].includes(action))
    usage(`${action} is not an action of ${slot}: ${CONTRACT[slot].join(", ")}`);

  const config = load(process.env.KITCHEN_CONFIG ? pathToFileURL(process.env.KITCHEN_CONFIG) : CONFIG);
  const settings = config.adapters[slot];
  const file = adapterFile(slot, settings.use, action);
  if (!existsSync(file)) {
    process.stderr.write(`adapters.${slot}.use is ${settings.use}, which has no ${action} at ${file}\n`);
    process.exit(1);
  }

  const run = spawnSync(file, args, {
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      KITCHEN_ADAPTER: JSON.stringify({ slot, settings, packageManager: config.packageManager, root: ROOT }),
    },
  });
  if (run.error) {
    process.stderr.write(`adapter ${slot}/${settings.use}/${action}: ${run.error.message}\n`);
    process.exit(1);
  }
  process.exit(run.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
