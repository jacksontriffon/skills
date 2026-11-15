import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { escapeRegExp, load } from "./kitchen.mjs";

const SCRIPTS = [
  "drive.mjs",
  "shoot-pair.sh",
  "shoot-design.sh",
  "design-server.sh",
  "dev-server.sh",
  "session-up.sh",
  "push-shots.sh",
  "is-native-change.mjs",
  "is-skippable-change.mjs",
];

function configured({ expo, baseBranch, packageManager, flows, design }) {
  return [
    expo.appDir,
    expo.routesDir,
    String(expo.webPort),
    `width: ${expo.viewport.width}`,
    `height: ${expo.viewport.height}`,
    expo.apiUrlEnv,
    `origin/${baseBranch}`,
    `${packageManager} `,
    flows,
    design,
  ].filter((literal) => literal.length >= 4);
}

const standalone = (literal) =>
  new RegExp(`(?<![\\w.])${escapeRegExp(literal)}`);

describe("the Expo scripts", () => {
  const literals = configured(load());

  for (const script of SCRIPTS) {
    it(`${script} names nothing it could read from kitchen.json`, () => {
      const text = readFileSync(new URL(`./${script}`, import.meta.url), "utf8");
      assert.deepEqual(
        literals.filter((literal) => standalone(literal).test(text)),
        [],
      );
    });
  }
});
