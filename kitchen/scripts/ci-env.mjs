import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { load } from "./kitchen.mjs";
import { ROOT } from "./layout.mjs";

const parse = (json, what) => {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    throw new Error(`${what} is not JSON`);
  }
};

export function envLines(config, { secrets = {}, vars = {} }) {
  const missing = [];
  const unquotable = [];
  const lines = [];
  const exported = [];
  const take = (names, from, kind) => {
    for (const name of names) {
      const value = from[name];
      if (value === undefined || value === "") {
        missing.push(`${kind} ${name}`);
        continue;
      }
      if (String(value).includes("'") || /[\r\n]/.test(String(value))) {
        unquotable.push(name);
        continue;
      }
      lines.push(`${name}='${value}'`);
      if (kind === "variable") exported.push(`${name}=${value}`);
    }
  };
  take(config.ci.secrets, secrets, "secret");
  take(config.ci.vars, vars, "variable");
  return { lines, exported, missing, unquotable };
}

export function easPublicEnv(appDir, root = ROOT) {
  const file = join(root, appDir, "eas.json");
  if (!existsSync(file)) return [];
  const env = JSON.parse(readFileSync(file, "utf8")).build?.base?.env ?? {};
  return Object.entries(env)
    .filter(([name]) => name.startsWith("EXPO_PUBLIC_"))
    .map(([name, value]) => `${name}=${value}`);
}

function main(args) {
  const config = load();
  const githubEnv = process.env.GITHUB_ENV;
  const envFile = join(ROOT, config.ci.envFile);
  const example = join(ROOT, ".env.example");

  if (args.includes("--eas")) {
    const lines = easPublicEnv(config.expo.appDir);
    if (githubEnv && lines.length > 0) appendFileSync(githubEnv, `${lines.join("\n")}\n`);
    for (const line of lines) console.log(line.split("=")[0]);
  }

  const { lines, exported, missing, unquotable } = envLines(config, {
    secrets: parse(process.env.KITCHEN_SECRETS_JSON, "KITCHEN_SECRETS_JSON"),
    vars: parse(process.env.KITCHEN_VARS_JSON, "KITCHEN_VARS_JSON"),
  });
  if (missing.length > 0) process.stderr.write(`unset repository ${missing.join(", ")}\n`);
  if (unquotable.length > 0)
    process.stderr.write(`values a dotenv file cannot quote (a ' or a newline): ${unquotable.join(", ")}\n`);
  if (missing.length > 0 || unquotable.length > 0) process.exit(1);

  if (!existsSync(envFile) && existsSync(example)) copyFileSync(example, envFile);
  appendFileSync(envFile, lines.length > 0 ? `${lines.join("\n")}\n` : "");
  if (githubEnv && exported.length > 0) appendFileSync(githubEnv, `${exported.join("\n")}\n`);
  console.log(`${config.ci.envFile}: ${lines.length} values from kitchen.json's ci.secrets and ci.vars`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
