import { emit, settings, windowFrom } from "../emit.mjs";

const [action, ...args] = process.argv.slice(2);
const given = settings();

function refuse(key, problem) {
  process.stderr.write(`kitchen.json: adapters.errors.${key} ${problem}\n`);
  process.exit(1);
}

for (const key of ["organization", "projectName", "timezone"])
  if (typeof given[key] !== "string" || !given[key]) refuse(key, "must be a non-empty string");
if (!Number.isInteger(given.project)) refuse("project", "must be an integer");
if (given.decoyProject !== undefined && !Number.isInteger(given.decoyProject))
  refuse("decoyProject", "must be an integer when it is given");

emit({
  slot: "errors",
  adapter: "posthog",
  action,
  enabled: true,
  window: windowFrom(args, action),
  pins: {
    organization: given.organization,
    project: given.project,
    projectName: given.projectName,
    timezone: given.timezone,
    decoyProject: given.decoyProject ?? null,
  },
  guide: ".claude/kitchen/adapters/errors/posthog/GUIDE.md",
});
