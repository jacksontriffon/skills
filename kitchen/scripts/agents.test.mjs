import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  agentNames,
  checkAgent,
  configProblems,
  DEFAULT_MODELS,
  dispatchProblems,
  LOOP_DISPATCHERS,
  modelFor,
  modelProblem,
  readAgent,
  withModel,
} from "./agents.mjs";
import { load, resolve } from "./kitchen.mjs";
import { notCarried, readSkill } from "./skill-shape.mjs";

const minimal = { repo: "acme/app", humans: { default: "owner" } };
const configured = (agents) => resolve({ ...minimal, agents });
const frontmatterModel = (source) => /^model: (\S+)$/m.exec(source)?.[1];

describe("every agent file is well formed", () => {
  for (const name of agentNames()) {
    it(name, () => {
      const problems = checkAgent(name, readAgent(name));
      assert.deepEqual(problems, [], `${name}: ${problems.join("; ")}`);
    });
  }
});

describe("the loops dispatch named agents", () => {
  for (const skill of LOOP_DISPATCHERS) {
    it(skill, { skip: notCarried(skill) }, () => {
      const problems = dispatchProblems(skill, readSkill(skill), agentNames());
      assert.deepEqual(problems, [], problems.join("; "));
    });
  }
});

describe("checkAgent", () => {
  const agent = [
    "---",
    "name: demo",
    "description: A demo agent.",
    "model: haiku",
    "---",
    "",
    "Do the thing.",
    "",
  ].join("\n");

  it("passes an agent that matches", () =>
    assert.deepEqual(checkAgent("demo", agent), []));

  it("allows an agent with no model, which inherits", () =>
    assert.deepEqual(
      checkAgent("demo", agent.replace("model: haiku\n", "")),
      [],
    ));

  it("catches a name that is not the file's", () =>
    assert.ok(checkAgent("other", agent).some((p) => p.includes("name"))));

  it("catches a model nothing serves", () =>
    assert.ok(
      checkAgent("demo", agent.replace("haiku", "gpt")).some((p) =>
        p.includes("model"),
      ),
    ));

  it("catches an agent with no instructions", () =>
    assert.ok(
      checkAgent("demo", agent.replace("Do the thing.", "")).some((p) =>
        p.includes("instructions"),
      ),
    ));
});

describe("dispatchProblems", () => {
  it("catches a general-purpose dispatch", () =>
    assert.equal(
      dispatchProblems("demo", "One `general-purpose` subagent.", []).length,
      1,
    ));

  it("catches an agent that has no file", () =>
    assert.equal(
      dispatchProblems("demo", "[`x`](../../agents/evidence-runner.md)", [
        "code-reviewer",
      ]).length,
      1,
    ));

  it("passes an agent that has a file", () =>
    assert.deepEqual(
      dispatchProblems("demo", "[`x`](../../agents/evidence-runner.md)", [
        "evidence-runner",
      ]),
      [],
    ));
});

describe("an agent's model comes from kitchen.json", () => {
  const config = load();

  for (const name of Object.keys(DEFAULT_MODELS)) {
    it(`${name}'s committed frontmatter is what kitchen.json says`, () => {
      const problem = modelProblem(name, readAgent(name), config);
      assert.equal(problem, null, problem ?? "");
    });
  }

  it("leaves lane-rebaser's model out of kitchen.json's reach", () =>
    assert.ok(!("lane-rebaser" in DEFAULT_MODELS)));

  it("names a default for every agent but the lane-rebaser", () =>
    assert.deepEqual(
      Object.keys(DEFAULT_MODELS).sort(),
      agentNames().filter((name) => name !== "lane-rebaser"),
    ));

  it("is configured only for agents that exist", () =>
    assert.deepEqual(configProblems(config), []));
});

describe("modelFor", () => {
  it("falls back to the agent's default when kitchen.json is silent", () => {
    const config = configured({});
    assert.equal(modelFor(config, "implementer"), "inherit");
    assert.equal(modelFor(config, "design-reviewer"), "haiku");
  });

  it("prefers what kitchen.json says", () =>
    assert.equal(
      modelFor(configured({ implementer: { model: "opus" } }), "implementer"),
      "opus",
    ));
});

describe("withModel", () => {
  const agent = [
    "---",
    "name: demo",
    "description: A demo agent.",
    "model: haiku",
    "---",
    "",
    "Do the thing.",
    "",
  ].join("\n");

  it("replaces the model line", () =>
    assert.equal(frontmatterModel(withModel(agent, "opus")), "opus"));

  it("adds a model line to an agent that has none", () => {
    const bare = agent.replace("model: haiku\n", "");
    assert.equal(frontmatterModel(withModel(bare, "sonnet")), "sonnet");
  });

  it("drops the line for inherit, which is what no line means", () =>
    assert.equal(frontmatterModel(withModel(agent, "inherit")), undefined));

  it("leaves the instructions alone", () =>
    assert.ok(withModel(agent, "opus").endsWith("---\n\nDo the thing.\n")));

  it("is a no-op when the model already matches", () =>
    assert.equal(withModel(agent, "haiku"), agent));

  it("produces a file checkAgent accepts", () =>
    assert.deepEqual(checkAgent("demo", withModel(agent, "opus")), []));
});

describe("modelProblem", () => {
  it("reaches the frontmatter: changing agents.<name>.model changes what the file must say", () => {
    const source = readAgent("implementer");
    assert.equal(modelProblem("implementer", source, configured({})), null);

    const trial = configured({ implementer: { model: "opus" } });
    assert.match(modelProblem("implementer", source, trial), /opus/);
    assert.equal(
      modelProblem("implementer", withModel(source, "opus"), trial),
      null,
    );
  });

  it("reaches an agent whose frontmatter names a model, too", () => {
    const source = readAgent("design-reviewer");
    const inherit = configured({ "design-reviewer": { model: "inherit" } });
    assert.match(modelProblem("design-reviewer", source, inherit), /inherit/);
    assert.equal(
      modelProblem("design-reviewer", withModel(source, "inherit"), inherit),
      null,
    );
  });
});

describe("configProblems", () => {
  it("catches an agent kitchen.json names that no file serves", () =>
    assert.ok(
      configProblems(configured({ implmenter: { model: "opus" } })).some((p) =>
        p.includes("implmenter"),
      ),
    ));

  it("refuses to configure the lane-rebaser", () =>
    assert.ok(
      configProblems(configured({ "lane-rebaser": { model: "opus" } })).some(
        (p) => p.includes("lane-rebaser"),
      ),
    ));
});

describe("kitchen.json's model", () => {
  it("refuses a model nothing serves", () =>
    assert.throws(
      () => configured({ implementer: { model: "gpt" } }),
      /agents\.implementer\.model/,
    ));
});
