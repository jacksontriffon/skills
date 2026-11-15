import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { at, ROOT } from "./layout.mjs";

export const CONFIG = pathToFileURL(join(ROOT, at(".claude/kitchen.json")));

export const DENYLIST = pathToFileURL(join(ROOT, "kitchen-denylist.txt"));

export const SCHEMA = JSON.parse(readFileSync(new URL("../kitchen.schema.json", import.meta.url), "utf8"));

export const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"];

export const MODELS = ["inherit", "haiku", "sonnet", "opus"];

export const SLOTS = ["stack", "db", "auth", "errors", "evidenceHost"];

export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ref = (schema) =>
  schema.$ref ? { ...SCHEMA.$defs[schema.$ref.split("/").at(-1)], ...schema } : schema;

function defaultOf(schema) {
  if ("default" in schema) return structuredClone(schema.default);
  const { properties } = ref(schema);
  if (!properties) return null;
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => key !== "$schema")
      .map(([key, child]) => [key, defaultOf(child)]),
  );
}

export const DEFAULTS = defaultOf(SCHEMA);

const OWN_SHAPE = new Set(["humans", "agents", "adapters"]);

const kind = (value) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);

function fail(path, problem) {
  throw new Error(`kitchen.json: ${path} ${problem}`);
}

function expect(path, value, type) {
  if (kind(value) !== type) fail(path, `must be ${type}, not ${kind(value)}`);
}

function merge(path, defaults, given) {
  if (given === undefined) return structuredClone(defaults);
  if (kind(defaults) === "object") {
    expect(path, given, "object");
    for (const key of Object.keys(given))
      if (!(key in defaults)) fail(`${path}.${key}`, "is not a key the kitchen reads");
    return Object.fromEntries(
      Object.keys(defaults).map((key) => [key, merge(`${path}.${key}`, defaults[key], given[key])]),
    );
  }
  if (defaults !== null) expect(path, given, kind(defaults));
  return given;
}

function adapter(slot, value = DEFAULTS.adapters[slot]) {
  if (typeof value === "string") return { use: value };
  expect(`adapters.${slot}`, value, "object");
  expect(`adapters.${slot}.use`, value.use, "string");
  return { ...value };
}

function humans(given) {
  expect("humans", given, "object");
  for (const key of Object.keys(given))
    if (!["default", "areas"].includes(key)) fail(`humans.${key}`, "is not a key the kitchen reads");
  expect("humans.default", given.default, "string");
  const areas = given.areas ?? {};
  expect("humans.areas", areas, "object");
  for (const [area, handle] of Object.entries(areas)) expect(`humans.areas.${area}`, handle, "string");
  return { default: given.default, areas: { ...areas } };
}

function agents(given = {}) {
  expect("agents", given, "object");
  return Object.fromEntries(
    Object.entries(given).map(([name, settings]) => {
      expect(`agents.${name}`, settings, "object");
      for (const key of Object.keys(settings))
        if (key !== "model") fail(`agents.${name}.${key}`, "is not a key the kitchen reads");
      if (settings.model !== undefined) {
        expect(`agents.${name}.model`, settings.model, "string");
        if (!MODELS.includes(settings.model))
          fail(`agents.${name}.model`, `must be one of ${MODELS.join(", ")}`);
      }
      return [name, { ...settings }];
    }),
  );
}

const typesOf = (schema) => [schema.type].flat();

const at_ = (path, key) => (path ? `${path}.${key}` : key);

export function validate(given, schema = SCHEMA, path = "") {
  schema = ref(schema);
  const where = path || "the file";
  const types = typesOf(schema);
  if (schema.type && !types.includes(kind(given)))
    fail(where, `must be ${types.join(" or ")}, not ${kind(given)}`);
  if (schema.enum && !schema.enum.includes(given)) fail(where, `must be one of ${schema.enum.join(", ")}`);
  if (schema.pattern && typeof given === "string" && !new RegExp(schema.pattern).test(given))
    fail(where, schema["x-message"] ?? `must match ${schema.pattern}`);
  if (kind(given) === "array" && schema.items)
    given.forEach((item, index) => validate(item, schema.items, `${where}[${index}]`));
  if (kind(given) !== "object") return;
  for (const key of schema.required ?? [])
    if (given[key] === undefined) {
      const child = ref(schema.properties?.[key] ?? {});
      fail(at_(path, key), `must be ${typesOf(child).join(" or ")}, not undefined`);
    }
  for (const [key, value] of Object.entries(given)) {
    const child = schema.properties?.[key];
    if (child) validate(value, child, at_(path, key));
    else if (schema.additionalProperties === false)
      fail(at_(path, key), schema["x-unknown"] ?? "is not a key the kitchen reads");
    else if (kind(schema.additionalProperties) === "object")
      validate(value, schema.additionalProperties, at_(path, key));
  }
}

const UNMATCHABLE_GLOB = /^\.\/|\/$|[{}?[\]\\]/;

export function resolve(given) {
  validate(given);
  given = Object.fromEntries(Object.entries(given).filter(([key]) => key !== "$schema"));
  for (const key of Object.keys(given))
    if (!(key in DEFAULTS)) fail(key, "is not a key the kitchen reads");

  expect("repo", given.repo, "string");
  if (!/^[\w.-]+\/[\w.-]+$/.test(given.repo)) fail("repo", "must be owner/name");
  if (given.packageManager !== undefined && !PACKAGE_MANAGERS.includes(given.packageManager))
    fail("packageManager", `must be one of ${PACKAGE_MANAGERS.join(", ")}`);

  const config = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (OWN_SHAPE.has(key)) continue;
    config[key] = merge(key, DEFAULTS[key], given[key]);
  }
  for (const tier of ["high", "medium"])
    config.risk[tier].forEach((glob, index) => {
      expect(`risk.${tier}[${index}]`, glob, "string");
      if (UNMATCHABLE_GLOB.test(glob))
        fail(
          `risk.${tier}[${index}]`,
          "is a glob that matches nothing: write a path from the repo root, `*` within a segment and `**` across them, with no `/` at the end, `./` at the start, or any of `{}?[]\\`",
        );
    });
  config.product ??= given.repo.split("/")[1];
  config.humans = humans(given.humans);
  config.agents = agents(given.agents);
  const adapters = given.adapters ?? {};
  expect("adapters", adapters, "object");
  for (const slot of Object.keys(adapters))
    if (!SLOTS.includes(slot)) fail(`adapters.${slot}`, "is not a slot the kitchen fills");
  config.adapters = Object.fromEntries(SLOTS.map((slot) => [slot, adapter(slot, adapters[slot])]));
  return config;
}

export function load(url = CONFIG) {
  return resolve(JSON.parse(readFileSync(url, "utf8")));
}

export function denylist(url = DENYLIST) {
  let text;
  try {
    text = readFileSync(url, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return text
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);
}

export function trusted(config) {
  return [...new Set([config.humans.default, ...Object.values(config.humans.areas)])];
}

function leaves(prefix, value) {
  if (kind(value) !== "object") return [[prefix, value]];
  return Object.entries(value).flatMap(([key, child]) => leaves(`${prefix}.${key}`, child));
}

export function get(config, path) {
  const value = path
    .split(".")
    .reduce((node, key) => (kind(node) === "object" && key in node ? node[key] : undefined), config);
  if (value === undefined) fail(path, "is not a key the kitchen reads");
  return value;
}

export const repoVariables = (config) => ({
  KITCHEN_RUNNER: config.ci.runner,
  KITCHEN_MAC_RUNNER: config.ci.macRunner,
});

export const workflowEnv = (config) => ({
  KITCHEN_APP_DIR: config.expo.appDir,
  KITCHEN_SCHEME: config.expo.scheme ?? "",
  KITCHEN_FLOWS: config.flows,
  KITCHEN_BASE_BRANCH: config.baseBranch,
  KITCHEN_PM: config.packageManager,
  KITCHEN_DESIGN: config.design,
  KITCHEN_API_URL_ENV: config.expo.apiUrlEnv,
  KITCHEN_ENV_FILE: config.ci.envFile,
  KITCHEN_PREVIEW_API: config.ci.previewApi ?? "",
  KITCHEN_LABEL_NATIVE_CHANGE: config.labels.nativeChange,
});

const assignments = (map) =>
  Object.entries(map)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

export function brief(config) {
  return [
    "Kitchen config, resolved from .claude/kitchen.json; a skill's `kitchen.<key>` is the value here:",
    ...leaves("kitchen", config).map(
      ([path, value]) => `${path} = ${typeof value === "string" ? value : JSON.stringify(value)}`,
    ),
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, path] = process.argv.slice(2);
  if (command === "brief") {
    console.log(brief(load()));
  } else if (command === "variables") {
    console.log(assignments(repoVariables(load())));
  } else if (command === "env") {
    console.log(assignments(workflowEnv(load())));
  } else if (command === "get" && path) {
    const value = get(load(), path);
    console.log(typeof value === "string" ? value : JSON.stringify(value));
  } else {
    process.stderr.write("usage: kitchen.mjs brief | variables | env | get <dotted.path>\n");
    process.exit(2);
  }
}
