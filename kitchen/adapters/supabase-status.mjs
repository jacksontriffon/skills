// `supabase status -o env` prints KEY="value" lines on a running stack. Every part of the three
// supabase adapters that reads the stack's URL or keys reads it through here.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function parseEnv(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return values;
}

export const cliWords = (settings) => (settings.command ?? "supabase").trim().split(/\s+/);

// null when the stack is not running, or the CLI is not there to ask.
export function readStatus({ settings, root }) {
  const [command, ...args] = cliWords(settings);
  const run = spawnSync(command, [...args, "status", "-o", "env"], {
    cwd: join(root, settings.dir ?? "."),
    encoding: "utf8",
  });
  return run.status === 0 ? parseEnv(run.stdout) : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  process.stdout.write(parseEnv(Buffer.concat(chunks).toString("utf8"))[process.argv[2]] ?? "");
}
