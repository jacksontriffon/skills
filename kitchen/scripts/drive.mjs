// Maestro drives the native surfaces off the same flow files. It cannot drive this one:
// `get.maestro.mobile.dev` is refused by the agent container's egress policy, so the
// binary never installs.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { load } from "./kitchen.mjs";
import { parseDocuments } from "./maestro-yaml.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const STATE_DIR = join(REPO_ROOT, ".claude/tmp");

// Metro bundles on first request, so the first navigation of a session waits for the
// whole bundle before anything renders.
const BUNDLE_TIMEOUT = 120_000;

const SWIPE_STEPS = 10;

const ADAPTER = join(dirname(fileURLToPath(import.meta.url)), "adapter.mjs");

export const signInArgs = (email, apiUrl, out) => [
  "auth",
  "sign-in",
  "--email",
  email,
  "--api-url",
  apiUrl,
  "--out",
  out,
];

async function signInThroughAdapter(email, apiUrl) {
  const out = join(STATE_DIR, `sign-in-${process.pid}-${Date.now()}.json`);
  try {
    await promisify(execFile)("node", [ADAPTER, ...signInArgs(email, apiUrl, out)], {
      env: process.env,
    });
    return JSON.parse(await readFile(out, "utf8"));
  } catch (error) {
    throw new Error(
      `signInAs ${email}: ${(error.stderr ?? error.message).trim().slice(0, 400)}. Seed that account first.`,
    );
  } finally {
    await rm(out, { force: true });
  }
}

// Runs in the page before its own scripts, and leaves a value the page has since rotated alone: a
// refreshed session replaces its token, and putting the old one back would sign the page out.
function seedLocalStorage({ origin, localStorage: entries }, scope = globalThis) {
  if (scope.location.origin !== origin) return;
  for (const { name, value } of entries) {
    if (scope.localStorage.getItem(name) === null) {
      scope.localStorage.setItem(name, value);
    }
  }
}

function substitute(value, env, where) {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => {
    if (!(name in env)) {
      throw new Error(`${where}: nothing defines \${${name}}`);
    }
    return env[name];
  });
}

function toSelector(argument, where, allowPoint = false) {
  if (typeof argument === "string") return { kind: "text", value: argument };
  if (argument && typeof argument === "object") {
    const { id, text, point } = argument;
    if (typeof point === "string") {
      if (!allowPoint) throw new Error(`${where}: point only works with tapOn`);
      return toPoint(point, where);
    }
    if (typeof id === "string") {
      return typeof text === "string"
        ? { kind: "testId", value: id, text }
        : { kind: "testId", value: id };
    }
    if (typeof text === "string") return { kind: "text", value: text };
  }
  throw new Error(`${where}: needs an \`id:\` or a \`text:\` to match`);
}

function toPoint(point, where) {
  const match = /^\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*$/.exec(point);
  if (!match) {
    throw new Error(`${where}: point needs two percentages, like "50%,50%"`);
  }
  return {
    kind: "point",
    x: Number(match[1]) / 100,
    y: Number(match[2]) / 100,
  };
}

function toSwipe(argument, where) {
  const named = argument && typeof argument === "object";
  if (named && !("start" in argument) && !("end" in argument)) {
    throw new Error(`${where}: \`swipe\` is not a command this runs`);
  }
  const { start, end } = named ? argument : {};
  if (typeof start !== "string" || typeof end !== "string") {
    throw new Error(`${where}: swipe needs a start and an end point`);
  }
  const { x: fromX, y: fromY } = toPoint(start, where);
  const { x: toX, y: toY } = toPoint(end, where);
  return { from: { x: fromX, y: fromY }, to: { x: toX, y: toY } };
}

function locate(page, selector) {
  if (selector.kind === "testId") {
    const byId = page.locator(`[data-testid="${selector.value}"]`);
    return (
      selector.text ? byId.filter({ hasText: new RegExp(selector.text, "i") }) : byId
    ).first();
  }
  return page
    .getByText(selector.value, { exact: false })
    .or(page.getByLabel(selector.value, { exact: false }))
    .first();
}

function selectorLabel(selector) {
  if (selector.kind === "point") return `point=${selector.x},${selector.y}`;
  if (selector.kind === "testId") {
    return selector.text
      ? `id=${selector.value} text=${selector.text}`
      : `id=${selector.value}`;
  }
  return `text=${selector.value}`;
}

function elementCommand(act) {
  return {
    parse: (argument, where) => ({ selector: toSelector(argument, where) }),
    label: (command) => selectorLabel(command.selector),
    run: (page, command, options) =>
      act(locate(page, command.selector), options),
  };
}

export const COMMANDS = {
  launchApp: {
    parse: () => ({}),
    label: () => "",
    run: (page, _command, options) =>
      page.goto(`${options.url}/`, {
        waitUntil: "load",
        timeout: BUNDLE_TIMEOUT,
      }),
  },
  openLink: {
    parse: (argument) => ({ link: argument }),
    label: (command) => command.link,
    run: (page, command) =>
      page.goto(command.link, { waitUntil: "load", timeout: BUNDLE_TIMEOUT }),
  },
  tapOn: {
    ...elementCommand((element, options) =>
      element.click({ timeout: options.timeout }),
    ),
    parse: (argument, where) => ({
      selector: toSelector(argument, where, true),
    }),
    run: (page, command, options) => {
      if (command.selector.kind === "point") {
        const { width, height } = page.viewportSize();
        return page.mouse.click(
          width * command.selector.x,
          height * command.selector.y,
        );
      }
      return locate(page, command.selector).click({ timeout: options.timeout });
    },
  },
  swipe: {
    parse: toSwipe,
    label: (command) =>
      `${command.from.x},${command.from.y} -> ${command.to.x},${command.to.y}`,
    run: async (page, command) => {
      const { width, height } = page.viewportSize();
      await page.mouse.move(width * command.from.x, height * command.from.y);
      await page.mouse.down();
      await page.mouse.move(width * command.to.x, height * command.to.y, {
        steps: SWIPE_STEPS,
      });
      await page.mouse.up();
    },
  },
  assertVisible: elementCommand((element, options) =>
    element.waitFor({ state: "visible", timeout: options.timeout }),
  ),
  assertNotVisible: elementCommand((element, options) =>
    element.waitFor({ state: "hidden", timeout: options.timeout }),
  ),
  scrollUntilVisible: {
    parse: (argument, where) => {
      if (!argument || typeof argument !== "object" || !argument.element) {
        throw new Error(`${where}: needs an \`element:\` to scroll to`);
      }
      return { selector: toSelector(argument.element, where) };
    },
    label: (command) => selectorLabel(command.selector),
    run: async (page, command, options) => {
      const element = locate(page, command.selector);
      await element.waitFor({ state: "attached", timeout: options.timeout });
      await element.scrollIntoViewIfNeeded({ timeout: options.timeout });
    },
  },
  extendedWaitUntil: {
    parse: (argument, where) => {
      if (!argument || typeof argument !== "object" || !argument.visible) {
        throw new Error(`${where}: needs a \`visible:\` to wait for`);
      }
      return {
        selector: toSelector(argument.visible, where),
        timeout:
          argument.timeout === undefined ? undefined : Number(argument.timeout),
      };
    },
    label: (command) => selectorLabel(command.selector),
    run: (page, command, options) =>
      locate(page, command.selector).waitFor({
        state: "visible",
        timeout: command.timeout ?? options.timeout,
      }),
  },
  // Maestro's addMedia puts files in the device's photo library for the flow to pick from;
  // web has no library, only a file chooser, so the next one the page opens is answered with them.
  addMedia: {
    parse: (argument, where) => {
      if (
        !Array.isArray(argument) ||
        argument.length === 0 ||
        argument.some((path) => typeof path !== "string")
      ) {
        throw new Error(`${where}: addMedia needs a list of files`);
      }
      return { paths: argument };
    },
    label: (command) => command.paths.join(", "),
    run: (page, command) => {
      const files = command.paths.map((path) =>
        resolve(dirname(command.file), path),
      );
      page.once("filechooser", (chooser) => chooser.setFiles(files));
    },
  },
  inputText: {
    parse: (argument, where) => {
      if (typeof argument !== "string") {
        throw new Error(`${where}: needs the text to type`);
      }
      return { text: argument };
    },
    label: (command) => command.text,
    // Maestro types into whatever the preceding tapOn focused, as the keyboard does.
    run: (page, command) => page.keyboard.type(command.text),
  },
  waitForAnimationToEnd: {
    parse: () => ({}),
    label: () => "",
    run: (page) => page.waitForTimeout(1_000),
  },
  takeScreenshot: {
    parse: (argument) => ({ shot: argument }),
    label: (command) => command.shot,
    run: async (page, command, options) => {
      await page.waitForTimeout(750);
      const path = join(options.shots, `${command.shot}.png`);
      await mkdir(dirname(path), { recursive: true });
      await page.screenshot({ path });
      options.written.push(path);
    },
  },
  signInAs: {
    parse: (argument, where) => {
      if (typeof argument !== "string" || !argument.includes("@")) {
        throw new Error(`${where}: needs the email of a seeded dev account`);
      }
      return { email: argument };
    },
    label: (command) => command.email,
    run: async (page, command, options) => {
      const state = await options.signIn(command.email, options.apiUrl);
      const context = page.context();
      await context.addCookies(state.cookies);
      for (const origin of state.origins ?? []) {
        await context.addInitScript(seedLocalStorage, origin);
      }
    },
  },
  // A bare string is the file, matching Maestro's own shorthand; `env` is scoped to
  // this one call, so the same subflow runs with different substitutions each time.
  runFlow: {
    parse: (argument, where) => {
      if (typeof argument === "string") {
        return { path: argument, envOverrides: {} };
      }
      if (
        argument &&
        typeof argument === "object" &&
        typeof argument.file === "string"
      ) {
        return { path: argument.file, envOverrides: argument.env ?? {} };
      }
      throw new Error(`${where}: needs a \`file:\` to run`);
    },
    label: (command) => command.path,
    run: async (page, command, options) => {
      const subflowPath = join(dirname(command.file), command.path);
      const text = await readFile(subflowPath, "utf8");
      const subflow = parseFlow(text, subflowPath, command.envOverrides);
      await run(page, subflow.commands, options);
    },
  },
};

function documentsOf(text, file) {
  try {
    return parseDocuments(text);
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}

export function parseFlow(text, file, envOverrides = {}) {
  const documents = documentsOf(text, file);
  if (documents.length < 2) {
    throw new Error(
      `${file}: needs a config document and a \`---\` before the commands`,
    );
  }

  const config = documents[0] ?? {};
  const list = documents[1] ?? [];
  if (!Array.isArray(list)) {
    throw new Error(`${file}: the second document must be a list of commands`);
  }

  const env = { ...(config.env ?? {}), ...envOverrides };

  const commands = list.map((entry, index) => {
    const where = `${file}: command ${index + 1}`;
    const name =
      typeof entry === "string" ? entry : Object.keys(entry ?? {})[0];
    const command = COMMANDS[name];
    if (!command) {
      throw new Error(`${where}: \`${name}\` is not a command this runs`);
    }
    const raw = typeof entry === "string" ? undefined : entry[name];
    const argument =
      typeof raw === "string" ? substitute(raw, env, where) : raw;

    return { name, file, ...command.parse(argument, where) };
  });

  return { config, commands };
}

// What the auth adapter's sign-in wrote is the answer: a session is a cookie, or a local storage
// entry under the app's origin, and a state with neither is how an app with no accounts signs in.
export function carriesSession(state, appOrigin) {
  return (
    (state.cookies ?? []).length > 0 ||
    (state.origins ?? []).some(
      (origin) =>
        (appOrigin === undefined || origin.origin === appOrigin) &&
        (origin.localStorage ?? []).length > 0,
    )
  );
}

// Maestro takes a directory as well as a file, and config.yaml's `flows:` is what
// decides which of its files that means — which is why `maestro test` on the flows folder
// drives the flows and leaves a check to be named by its path.
const DEFAULT_FLOW_GLOBS = ["*.yaml"];

export function selectFlowFiles(paths, patterns) {
  return paths
    .filter((path) => patterns.some((pattern) => matchesGlob(path, pattern)))
    .sort();
}

async function yamlFilesUnder(directory) {
  const found = [];
  const walk = async (current, prefix) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(current, entry.name), path);
      else if (entry.name.endsWith(".yaml")) found.push(path);
    }
  };
  await walk(directory, "");
  return found;
}

export async function flowPaths(path) {
  if (!(await stat(path)).isDirectory()) return [path];

  const config = await readIfPresent(join(path, "config.yaml"));
  const patterns = config
    ? ((documentsOf(config, join(path, "config.yaml"))[0] ?? {}).flows ?? DEFAULT_FLOW_GLOBS)
    : DEFAULT_FLOW_GLOBS;

  const files = selectFlowFiles(await yamlFilesUnder(path), patterns);
  if (files.length === 0) {
    throw new Error(`${path}: nothing under it matches ${patterns.join(", ")}`);
  }
  return files.map((file) => join(path, file));
}

export function parseArgs(argv) {
  const args = { env: {}, timeout: 15_000 };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) {
      args.flow = key;
      continue;
    }
    const value = argv[++i];
    if (key === "--url") args.url = value;
    else if (key === "--state") args.state = value;
    else if (key === "--shots") args.shots = value;
    else if (key === "--timeout") args.timeout = Number(value);
    else if (key === "--cut") args.cut = value;
    else if (key === "--cut-status") args.cutStatus = Number(value);
    else if (key === "--hold") args.hold = value;
    else if (key === "--hold-ms") args.holdMs = Number(value);
    else if (key === "--voice") args.voice = value;
    else if (key === "--color-scheme") {
      if (value !== "light" && value !== "dark") {
        throw new Error(`--color-scheme takes light or dark, not ${value}`);
      }
      args.colorScheme = value;
    }
    else if (key === "--api-url") args.apiUrl = value;
    else if (key === "--env") {
      const at = value.indexOf("=");
      args.env[value.slice(0, at)] = value.slice(at + 1);
    } else throw new Error(`unknown argument: ${key}`);
  }
  if (!args.flow) throw new Error("a flow file or directory is required");
  return args;
}

async function readIfPresent(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function findInstalledChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const builds = (await readdir(root))
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const build of builds) {
    for (const dir of ["chrome-linux64", "chrome-linux"]) {
      const binary = join(root, build, dir, "chrome");
      if (existsSync(binary)) return binary;
    }
  }
  return undefined;
}

async function launch() {
  try {
    return await chromium.launch();
  } catch (error) {
    const fallback = await findInstalledChromium();
    if (!fallback) throw error;
    console.error(`playwright's own chromium is missing; using ${fallback}`);
    return chromium.launch({ executablePath: fallback });
  }
}

async function resolveState(args, flowPath, tags, appUrl) {
  const path = args.state ?? join(STATE_DIR, "auth.json");
  if (!args.state && !tags.includes("signed-in")) return undefined;

  const state = await readIfPresent(path);
  if (!state) {
    throw new Error(
      `${flowPath} is tagged signed-in and ${path} is missing. ` +
        `Start the API with AUTH_DEV_LOGIN=1, then run node .claude/kitchen/scripts/adapter.mjs auth sign-in.`,
    );
  }
  if (!carriesSession(JSON.parse(state), new URL(appUrl).origin)) {
    throw new Error(
      `${path} carries no session (no cookie, and no local storage entry for ${new URL(appUrl).origin}), so the flow would run signed out. ` +
        `Run node .claude/kitchen/scripts/adapter.mjs auth sign-in again.`,
    );
  }
  return path;
}

async function run(page, commands, options) {
  for (const command of commands) {
    const label = COMMANDS[command.name].label(command);
    console.log(`${command.file}  ${command.name}${label ? ` ${label}` : ""}`);
    await COMMANDS[command.name].run(page, command, options);
  }
}

// A phone loses the network per request, not per app, so this cuts one tRPC procedure
// and leaves the session and everything else on the screen answering as they were.
async function cutRoute(page, procedure, status) {
  await page.route("**/api/trpc/**", (route) => {
    if (!route.request().url().includes(procedure)) return route.continue();
    if (!status) return route.abort("internetdisconnected");
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: `${procedure} cut by --cut` } }),
    });
  });
}

async function holdRoute(page, procedure, ms) {
  await page.route("**/api/trpc/**", async (route) => {
    if (!route.request().url().includes(procedure)) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, ms));
    return route.continue().catch(() => undefined);
  });
}

// Headless Chromium ships no speech voices, so expo-speech hides the speaker button.
export function installSpeechStub(window, lang) {
  const voice = {
    voiceURI: `stub-${lang}`,
    name: `Stub ${lang}`,
    lang,
    localService: true,
    default: true,
  };
  window.SpeechSynthesisUtterance = class {};
  window.speechSynthesis.getVoices = () => [voice];
  window.speechSynthesis.speak = (utterance) => {
    window.speechSynthesis.speaking = true;
    utterance.onstart?.({});
  };
  window.speechSynthesis.cancel = () => {
    window.speechSynthesis.speaking = false;
  };
}

function speechStubScript(lang) {
  return `(${installSpeechStub.toString()})(window, ${JSON.stringify(lang)})`;
}

const withoutSlash = (url) => url.replace(/\/$/, "");

export function surface({ expo } = load(), env = process.env) {
  return {
    url: `http://localhost:${expo.webPort}`,
    viewport: { ...expo.viewport },
    apiUrl: withoutSlash(env[expo.apiUrlEnv] || "http://localhost:3000"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const defaults = surface();
  const recorded = await readIfPresent(join(STATE_DIR, "dev-server.url"));
  const url = withoutSlash(args.url ?? recorded?.trim() ?? defaults.url);
  const env = { LINK_PREFIX: url, ...args.env };
  const recordedApi = await readIfPresent(
    join(STATE_DIR, "dev-server.api.url"),
  );
  const apiUrl = withoutSlash(
    args.apiUrl ?? (recordedApi?.trim() || defaults.apiUrl),
  );

  // Every flow is read and its session resolved before the browser opens, so a run
  // that cannot sign in stops on the missing fixture rather than part way down a
  // directory, having photographed signed-out screens.
  const flows = [];
  for (const path of await flowPaths(args.flow)) {
    const flow = parseFlow(await readFile(path, "utf8"), path, env);
    flows.push({
      path,
      flow,
      state: await resolveState(args, path, flow.config.tags ?? [], url),
    });
  }

  const browser = await launch();
  const written = [];
  const failures = [];

  try {
    for (const { path, flow, state } of flows) {
      // A context per flow, so one flow's storage state and routing never reach the
      // next — the same isolation a device gets from reinstalling between flows.
      const context = await browser.newContext({
        viewport: defaults.viewport,
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        colorScheme: args.colorScheme,
        storageState: state,
      });
      if (args.voice) await context.addInitScript(speechStubScript(args.voice));
      const page = await context.newPage();
      if (args.cut) await cutRoute(page, args.cut, args.cutStatus);
      if (args.hold) await holdRoute(page, args.hold, args.holdMs ?? 6_000);

      const shots = args.shots ?? join(STATE_DIR, "shots");
      page.on("pageerror", (error) =>
        console.error(`pageerror ${error.message.slice(0, 300)}`),
      );
      page.on("console", (message) => {
        if (message.type() === "error") {
          console.error(`console ${message.text().slice(0, 300)}`);
        }
      });
      const entryCalls = [];
      page.on("response", async (response) => {
        const target = response.url();
        const [route = ""] = (target.split("/api/trpc/")[1] ?? "").split("?");
        if (!target.includes("/api/trpc/") || !route.includes("entry")) return;
        const procedures = decodeURIComponent(route).split(",");
        const results = await response.json().catch(() => []);
        procedures.forEach((procedure, index) => {
          if (!procedure.endsWith(".entry")) return;
          const result = JSON.stringify(
            (Array.isArray(results) ? results[index] : results) ?? null,
          );
          entryCalls.push(
            `trpc ${response.status()} ${procedure} -> ${result.slice(0, 400)}`,
          );
        });
      });

      try {
        await run(page, flow.commands, {
          url,
          shots,
          timeout: args.timeout,
          written,
          apiUrl,
          signIn: signInThroughAdapter,
        });
      } catch (error) {
        console.error(`${path}: ${error.message}`);
        console.error(`${path}: stopped at ${page.url()}`);
        for (const call of entryCalls.slice(-5)) console.error(call);
        const stopped = join(
          shots,
          `${basename(path, extname(path))}-failure.png`,
        );
        await mkdir(dirname(stopped), { recursive: true });
        await page.screenshot({ path: stopped }).then(
          () => written.push(stopped),
          () => {},
        );
        failures.push(path);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  for (const path of written) console.log(path);

  // The shots a walled-off flow took before the wall are still evidence, so they are
  // printed above rather than thrown away with the exit code.
  if (failures.length > 0) {
    throw new Error(
      `${failures.length} of ${flows.length} did not finish: ${failures.join(", ")}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
