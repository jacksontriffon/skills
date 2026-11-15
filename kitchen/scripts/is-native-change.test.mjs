import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  depsChanged,
  isNativeChange as isNativeChangeFor,
  nativeChanges as nativeChangesFor,
} from "./is-native-change.mjs";
import { load, resolve } from "./kitchen.mjs";

const KITCHEN = resolve({
  repo: "someone/app",
  humans: { default: "someone" },
  expo: { appDir: "apps/mobile" },
});
const isNativeChange = (path) => isNativeChangeFor(path, KITCHEN);
const nativeChanges = (paths) => nativeChangesFor(paths, KITCHEN);

const SCRIPT = fileURLToPath(
  new URL("./is-native-change.mjs", import.meta.url),
);

describe("isNativeChange", () => {
  for (const path of [
    "apps/mobile/ios/Podfile",
    "apps/mobile/android/build.gradle",
    "apps/mobile/app.config.ts",
    "apps/mobile/modules/expo-ocr/ios/ExpoOcr.podspec",
    "apps/mobile/modules/expo-ocr/ios/ExpoOcrModule.swift",
    "apps/mobile/modules/expo-ocr/android/build.gradle",
    "apps/mobile/modules/expo-ocr/android/src/main/java/expo/modules/ocr/ExpoOcrModule.kt",
    "apps/mobile/modules/expo-ocr/expo-module.config.json",
  ]) {
    it(`flags ${path}`, () => assert.ok(isNativeChange(path)));
  }

  // #167's diff, refused by the guard even though nothing in it reaches the binary.
  for (const path of [
    "apps/mobile/modules/expo-ocr/index.ts",
    "apps/mobile/modules/expo-ocr/src/ExpoOcr.types.ts",
    "apps/mobile/modules/expo-ocr/src/ExpoOcrModule.web.ts",
  ]) {
    it(`does not flag ${path}`, () => assert.ok(!isNativeChange(path)));
  }

  for (const path of [
    "apps/mobile/modules/expo-ocr/src/ExpoOcrModule.ts",
    "apps/mobile/modules/expo-ocr/src/layout.ts",
    "apps/mobile/modules/expo-ocr/src/layout.test.ts",
    "apps/mobile/modules/expo-ocr/fixtures/index.ts",
    "apps/mobile/modules/expo-ocr/README.md",
    "apps/mobile/modules/expo-ocr/LICENSE",
    "apps/mobile/expo-plugins/with-fmt-consteval.js",
    "apps/mobile/package.json",
    "apps/mobile/src/app/index.tsx",
  ]) {
    it(`does not flag ${path}`, () => assert.ok(!isNativeChange(path)));
  }
});

describe("isNativeChange, read from kitchen.json", () => {
  it("finds the native folders at the repo root when the app is the repo", () => {
    const root = resolve({ repo: "someone/app", humans: { default: "someone" } });
    assert.ok(isNativeChangeFor("ios/Podfile", root));
    assert.ok(isNativeChangeFor("app.config.ts", root));
    assert.ok(!isNativeChangeFor("apps/mobile/ios/Podfile", root));
  });

  it("takes the native folders kitchen.json names", () => {
    const iosOnly = resolve({
      repo: "someone/app",
      humans: { default: "someone" },
      expo: { appDir: "apps/mobile", nativeDirs: ["ios"] },
    });
    assert.ok(isNativeChangeFor("apps/mobile/ios/Podfile", iosOnly));
    assert.ok(!isNativeChangeFor("apps/mobile/android/build.gradle", iosOnly));
  });

  it("reads this repo's kitchen.json when given none", () => {
    const { appDir } = load().expo;
    assert.ok(isNativeChangeFor(`${appDir}/ios/Podfile`));
    assert.ok(!isNativeChangeFor(`${appDir}/src/index.ts`));
  });
});

describe("nativeChanges", () => {
  it("keeps only the native paths, in order", () => {
    assert.deepEqual(
      nativeChanges([
        "apps/mobile/modules/expo-ocr/index.ts",
        "apps/mobile/modules/expo-ocr/ios/ExpoOcrModule.swift",
        "apps/mobile/package.json",
        "apps/mobile/app.config.ts",
      ]),
      [
        "apps/mobile/modules/expo-ocr/ios/ExpoOcrModule.swift",
        "apps/mobile/app.config.ts",
      ],
    );
  });
});

describe("depsChanged", () => {
  it("is false when dependencies and devDependencies are the same", () => {
    const base = {
      dependencies: { expo: "1.0.0" },
      devDependencies: { vitest: "3.0.0" },
    };
    const head = {
      dependencies: { expo: "1.0.0" },
      devDependencies: { vitest: "3.0.0" },
    };
    assert.ok(!depsChanged(base, head));
  });

  it("is false when only a script, main or another top-level field moves", () => {
    const base = { main: "index.ts", dependencies: { expo: "1.0.0" } };
    const head = {
      main: "src/index.ts",
      dependencies: { expo: "1.0.0" },
      scripts: { lint: "eslint" },
    };
    assert.ok(!depsChanged(base, head));
  });

  it("is true when a dependency's version moves", () => {
    const base = { dependencies: { expo: "1.0.0" } };
    const head = { dependencies: { expo: "1.0.1" } };
    assert.ok(depsChanged(base, head));
  });

  it("is true when a dependency is added or removed", () => {
    const base = { dependencies: {} };
    const head = { dependencies: { "expo-notifications": "1.0.0" } };
    assert.ok(depsChanged(base, head));
  });

  it("is true when a devDependency moves, even with unchanged dependencies", () => {
    const base = {
      dependencies: { expo: "1.0.0" },
      devDependencies: { vitest: "3.0.0" },
    };
    const head = {
      dependencies: { expo: "1.0.0" },
      devDependencies: { vitest: "3.1.0" },
    };
    assert.ok(depsChanged(base, head));
  });

  it("treats a missing dependencies/devDependencies block as empty", () => {
    assert.ok(!depsChanged({}, { dependencies: {}, devDependencies: {} }));
  });
});

describe("the deps-changed CLI subcommand", () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "is-native-change-test-"));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writePkg(name, contents) {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(contents));
    return path;
  }

  it("prints the native paths among the ones it reads", () => {
    const { appDir } = load().expo;
    const printed = execFileSync("node", [SCRIPT], {
      input: `${appDir}/ios/Podfile\n${appDir}/src/index.ts\n`,
      encoding: "utf8",
    });
    assert.equal(printed, `${appDir}/ios/Podfile\n`);
  });

  function run(basePath, headPath) {
    return execFileSync("node", [SCRIPT, "deps-changed", basePath, headPath]);
  }

  it("exits 0 when dependencies are unchanged", () => {
    const base = writePkg("base-unchanged.json", {
      dependencies: { expo: "1.0.0" },
    });
    const head = writePkg("head-unchanged.json", {
      dependencies: { expo: "1.0.0" },
    });
    assert.doesNotThrow(() => run(base, head));
  });

  it("exits nonzero when a dependency moved", () => {
    const base = writePkg("base-moved.json", {
      dependencies: { expo: "1.0.0" },
    });
    const head = writePkg("head-moved.json", {
      dependencies: { expo: "1.0.1" },
    });
    assert.throws(() => run(base, head));
  });
});
