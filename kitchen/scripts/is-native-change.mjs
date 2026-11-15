import { fileURLToPath } from "node:url";

import { escapeRegExp, load } from "./kitchen.mjs";

// A module's own JS/TS bundles like any other JS — an OTA update reaches a phone without
// ever touching it. Only the native folders and the autolinking declaration actually compile
// into the binary a device already has installed.
export function nativePatterns({ appDir, nativeDirs }) {
  const app = appDir === "." ? "" : `${escapeRegExp(appDir.replace(/\/+$/, ""))}/`;
  const native = nativeDirs.map(escapeRegExp).join("|");
  return [
    new RegExp(`^${app}(${native})/`),
    new RegExp(`^${app}(modules|expo-plugins)/[^/]+/(${native})/`),
    new RegExp(`^${app}(modules|expo-plugins)/[^/]+/expo-module\\.config\\.json$`),
    new RegExp(`^${app}app\\.config\\.ts$`),
  ];
}

export function isNativeChange(path, kitchen = load()) {
  return nativePatterns(kitchen.expo).some((pattern) => pattern.test(path));
}

export function nativeChanges(paths, kitchen = load()) {
  const patterns = nativePatterns(kitchen.expo);
  return paths.filter((path) => patterns.some((pattern) => pattern.test(path)));
}

// The app's package.json itself is never a native path — a script, `main`, or the
// `expo.doctor` block rides along inside the bundle like any other JS. Only a dependency
// moving compiles into the binary, so that's read from the file's content at two refs
// rather than from its mere presence in a diff.
export function depsChanged(basePkg, headPkg) {
  const deps = (pkg) =>
    JSON.stringify([pkg.dependencies ?? {}, pkg.devDependencies ?? {}]);
  return deps(basePkg) !== deps(headPkg);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { readFileSync } = await import("node:fs");

  if (process.argv[2] === "deps-changed") {
    const [basePkgPath, headPkgPath] = process.argv.slice(3);
    const basePkg = JSON.parse(readFileSync(basePkgPath, "utf8"));
    const headPkg = JSON.parse(readFileSync(headPkgPath, "utf8"));
    // Exit 0 (success) when unchanged, matching `nativeChanges`' convention of printing
    // nothing when there is nothing to report — the workflow's `||` reads a nonzero exit
    // as "moved".
    process.exit(depsChanged(basePkg, headPkg) ? 1 : 0);
  } else {
    const changed = readFileSync(0, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const path of nativeChanges(changed)) console.log(path);
  }
}
