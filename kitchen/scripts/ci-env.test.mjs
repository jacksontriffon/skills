import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { easPublicEnv, envLines } from "./ci-env.mjs";
import { resolve } from "./kitchen.mjs";

const config = (ci) => resolve({ repo: "acme/app", humans: { default: "owner" }, ci });

describe("envLines", () => {
  it("writes each secret and variable kitchen.json names, quoted", () => {
    const { lines, missing } = envLines(config({ secrets: ["DB_URL"], vars: ["PUBLIC_URL"] }), {
      secrets: { DB_URL: "postgres://x", OTHER: "never" },
      vars: { PUBLIC_URL: "https://x.test" },
    });
    assert.deepEqual(lines, ["DB_URL='postgres://x'", "PUBLIC_URL='https://x.test'"]);
    assert.deepEqual(missing, []);
  });

  it("writes nothing it was not asked for", () => {
    const { lines } = envLines(config({}), { secrets: { DB_URL: "x" }, vars: { A: "b" } });
    assert.deepEqual(lines, []);
  });

  it("exports only the variables to the job, never a secret", () => {
    const { exported } = envLines(config({ secrets: ["S"], vars: ["V"] }), { secrets: { S: "1" }, vars: { V: "2" } });
    assert.deepEqual(exported, ["V=2"]);
  });

  it("names every value that is unset or empty", () => {
    const { missing } = envLines(config({ secrets: ["A", "B"], vars: ["C"] }), { secrets: { B: "" } });
    assert.deepEqual(missing, ["secret A", "secret B", "variable C"]);
  });

  it("refuses a value a dotenv file and a shell would read differently", () => {
    const { unquotable, lines } = envLines(config({ secrets: ["A", "B"] }), { secrets: { A: "it's", B: "a\nb" } });
    assert.deepEqual(unquotable, ["A", "B"]);
    assert.deepEqual(lines, []);
  });

  it("is refused by the schema for a name a shell cannot export", () => {
    assert.throws(() => config({ secrets: ["not-a-name"] }), /ci\.secrets\[0\]/);
  });
});

describe("easPublicEnv", () => {
  const root = () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-env-"));
    mkdirSync(join(dir, "app"));
    return dir;
  };

  it("reads the EXPO_PUBLIC_ values every build ships, and nothing else", () => {
    const dir = root();
    writeFileSync(
      join(dir, "app/eas.json"),
      JSON.stringify({ build: { base: { env: { EXPO_PUBLIC_KEY: "k", SECRET: "s" } } } }),
    );
    assert.deepEqual(easPublicEnv("app", dir), ["EXPO_PUBLIC_KEY=k"]);
  });

  it("is empty for an app with no eas.json", () => {
    assert.deepEqual(easPublicEnv("app", root()), []);
  });
});
