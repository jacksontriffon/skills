import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { adapterFile, CONTRACT } from "./adapter.mjs";
import { CONFIG, DENYLIST, load, repoVariables } from "./kitchen.mjs";
import { ROOT } from "./layout.mjs";

export const WORKFLOWS = ["bootstrap", "pr-preview", "scripts", "shoot-design", "shoot-expo-web", "verify-expo"];

export const ROW = "BLOCKERS.core.md#setting-up-the-kitchen";

export const LABELS = {
  blocked: ["B60205", "A blocker stops this PR; its 🧱 issue says which"],
  needsHuman: ["D93F0B", "An agent cannot fix this; the person tagged can"],
  readyForHuman: ["0E8A16", "Handed over: a person reviews and merges"],
  autoMerge: ["0E8A16", "Low risk: the loop merges it once CI is green on its head"],
  riskLow: ["C2E0C6", "Risk review: low"],
  riskMedium: ["FBCA04", "Risk review: medium"],
  riskHigh: ["B60205", "Risk review: high"],
  urgent: ["B60205", "Picked up before anything else"],
  needsTriage: ["EDEDED", "Not yet triaged"],
  needsInfo: ["D4C5F9", "Waiting on the reporter"],
  wontfix: ["FFFFFF", "Will not be worked on"],
  decision: ["5319E7", "A decision a person makes"],
  dbChange: ["1D76DB", "Touches the schema or its migrations"],
  skillChange: ["1D76DB", "Touches agent instructions"],
  dependsOnPr: ["C5DEF5", "Waits on another PR"],
  evidence: ["0E8A16", "Carries Before/After shots"],
  nativeChange: ["5319E7", "Touches native code or deps — an EAS build tests it, not the OTA preview"],
  claimed: ["BFD4F2", "An agent is working on this"],
};

const result = (check, ok, detail, key) => ({ check, ok, detail, ...(ok ? {} : { row: `${ROW} · \`${key}\`` }) });

export function labelRows(config) {
  return Object.entries(config.labels).map(([key, name]) => [name, ...(LABELS[key] ?? ["EDEDED", ""])]);
}

export function checkConfig(url = CONFIG) {
  if (!existsSync(url)) return [result("config", false, `${fileURLToPath(url)} is missing`, "kitchen:config-missing")];
  try {
    const config = load(url);
    return [result("config", true, `${config.repo}, valid against kitchen.schema.json`)];
  } catch (error) {
    return [result("config", false, error.message, "kitchen:config-invalid")];
  }
}

export function checkDenylist(url = DENYLIST) {
  if (!existsSync(url))
    return [result("denylist", false, "kitchen-denylist.txt is missing at the repo root", "kitchen:denylist-missing")];
  const lines = readFileSync(url, "utf8").split("\n");
  if (lines.some((line, index) => line.trim() === "" && index < lines.length - 1))
    return [
      result(
        "denylist",
        false,
        "kitchen-denylist.txt holds a blank line, which `grep -F -f` matches against every line",
        "kitchen:denylist-blank-line",
      ),
    ];
  return [result("denylist", true, `${lines.filter((line) => line.trim()).length} literals`)];
}

function syntax(file) {
  const head = readFileSync(file, "utf8").split("\n", 1)[0];
  if (file.endsWith(".mjs") || /\bnode\b/.test(head)) return spawnSync("node", ["--check", file], { encoding: "utf8" });
  return spawnSync("bash", ["-n", file], { encoding: "utf8" });
}

export function checkAdapters(config) {
  return Object.entries(CONTRACT).map(([slot, actions]) => {
    const { use } = config.adapters[slot];
    const problems = actions.flatMap((action) => {
      const file = adapterFile(slot, use, action);
      if (!existsSync(file)) return [`no ${action}`];
      if (!(statSync(file).mode & 0o111)) return [`${action} is not executable`];
      const run = syntax(file);
      return run.status === 0 ? [] : [`${action} does not parse: ${(run.stderr || "").trim().split("\n")[0]}`];
    });
    return problems.length === 0
      ? result(`adapter ${slot}`, true, `${use}: ${actions.join(", ")}`)
      : result(`adapter ${slot}`, false, `${use}: ${problems.join("; ")}`, "kitchen:adapter-contract");
  });
}

export function checkWorkflows(root = ROOT) {
  const missing = WORKFLOWS.filter((name) => !existsSync(join(root, ".github/workflows", `kitchen-${name}.yml`)));
  return [
    missing.length === 0
      ? result("workflows", true, `${WORKFLOWS.length} kitchen workflows`)
      : result("workflows", false, `missing ${missing.map((name) => `kitchen-${name}.yml`).join(", ")}`, "kitchen:workflow-missing"),
  ];
}

async function github(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "kitchen-doctor" },
  });
  return { status: response.status, body: response.ok ? await response.json() : null };
}

export async function checkGitHub(config, token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
  if (!token)
    return [result("github", false, "no GH_TOKEN or GITHUB_TOKEN to read the repo with", "kitchen:doctor-no-token")];
  const out = [];
  const labels = await github(`/repos/${config.repo}/labels?per_page=100`, token);
  if (labels.status !== 200) {
    out.push(result("labels", false, `GitHub answered ${labels.status} for ${config.repo}'s labels`, "kitchen:doctor-no-token"));
  } else {
    const have = new Set(labels.body.map((label) => label.name));
    const missing = Object.values(config.labels).filter((name) => !have.has(name));
    out.push(
      missing.length === 0
        ? result("labels", true, `${Object.keys(config.labels).length} labels`)
        : result("labels", false, `missing ${missing.join(", ")}`, "kitchen:labels-missing"),
    );
  }
  const workflows = await github(`/repos/${config.repo}/actions/workflows?per_page=100`, token);
  if (workflows.status === 200) {
    const have = new Set(workflows.body.workflows.map((workflow) => workflow.path));
    const missing = WORKFLOWS.filter((name) => !have.has(`.github/workflows/kitchen-${name}.yml`));
    out.push(
      missing.length === 0
        ? result("workflows on GitHub", true, "every kitchen workflow is on the default branch")
        : result("workflows on GitHub", false, `not on the default branch: ${missing.join(", ")}`, "kitchen:workflow-missing"),
    );
  }
  for (const [name, wanted] of Object.entries(repoVariables(config))) {
    const variable = await github(`/repos/${config.repo}/actions/variables/${name}`, token);
    const fallback = name === "KITCHEN_RUNNER" ? "ubuntu-latest" : "macos-latest";
    const value = variable.status === 200 ? variable.body.value : fallback;
    out.push(
      value === wanted
        ? result(`variable ${name}`, true, value)
        : result(`variable ${name}`, false, `the repo runs on ${value}, kitchen.json's ci says ${wanted}`, "kitchen:runner-variable"),
    );
  }
  return out;
}

export function checkSessionUp(config, root = ROOT) {
  const scripts = join(root, ".claude/kitchen/scripts");
  const up = spawnSync(join(scripts, "session-up.sh"), ["up"], { cwd: root, encoding: "utf8", timeout: 15 * 60_000 });
  const url = (up.stdout || "").trim().split("\n").at(-1);
  if (up.status !== 0 || !url) {
    const tail = (up.stderr || "").trim().split("\n").slice(-3).join(" · ");
    return [result("session-up", false, `exit ${up.status}: ${tail}`, "kitchen:session-up")];
  }
  const out = join(root, ".claude/tmp/doctor/home.png");
  mkdirSync(join(root, ".claude/tmp/doctor"), { recursive: true });
  const { width, height } = config.expo.viewport;
  const shot = spawnSync("node", [join(scripts, "capture.mjs"), "--url", `${url}/`, "--out", out], {
    cwd: root,
    encoding: "utf8",
    timeout: 5 * 60_000,
  });
  spawnSync(join(scripts, "session-up.sh"), ["down"], { cwd: root, encoding: "utf8" });
  return shot.status === 0 && existsSync(out)
    ? [result("session-up", true, `home shot at ${width}×${height}: ${out}`)]
    : [result("session-up", false, `the app came up at ${url} but the home shot failed: ${(shot.stderr || "").trim().split("\n").at(-1)}`, "kitchen:home-shot")];
}

export function format(results) {
  return results
    .map(({ check, ok, detail, row }) => `${ok ? "ok  " : "FAIL"}  ${check}: ${detail}${row ? `\n      → ${row}` : ""}`)
    .join("\n");
}

const CHECKS = ["config", "denylist", "adapters", "workflows", "github", "session-up"];
const NEEDS_NETWORK = new Set(["github", "session-up"]);

export async function doctor({ offline = false, only = CHECKS } = {}) {
  const results = [];
  const wanted = (check) => only.includes(check) && !(offline && NEEDS_NETWORK.has(check));
  if (wanted("config")) results.push(...checkConfig());
  if (results.some(({ ok }) => !ok)) return results;
  const config = load();
  if (wanted("denylist")) results.push(...checkDenylist());
  if (wanted("adapters")) results.push(...checkAdapters(config));
  if (wanted("workflows")) results.push(...checkWorkflows());
  if (wanted("github")) results.push(...(await checkGitHub(config)));
  if (wanted("session-up")) results.push(...checkSessionUp(config));
  for (const check of only.filter((name) => offline && NEEDS_NETWORK.has(name)))
    results.push({ check, ok: true, detail: "skipped: --offline" });
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--labels")) {
    for (const row of labelRows(load())) console.log(row.join("\t"));
  } else {
    const onlyAt = args.indexOf("--only");
    const only = onlyAt === -1 ? CHECKS : args.slice(onlyAt + 1).filter((arg) => !arg.startsWith("--"));
    const unknown = only.filter((check) => !CHECKS.includes(check));
    if (unknown.length > 0) {
      process.stderr.write(`usage: doctor.mjs [--offline] [--only ${CHECKS.join("|")}...] | --labels\n`);
      process.exit(2);
    }
    const results = await doctor({ offline: args.includes("--offline"), only });
    console.log(format(results));
    if (results.some(({ ok }) => !ok)) process.exitCode = 1;
  }
}

