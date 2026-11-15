import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  carriesSession,
  COMMANDS,
  flowPaths,
  installSpeechStub,
  parseArgs,
  parseFlow,
  selectFlowFiles,
  signInArgs,
  surface,
} from "./drive.mjs";
import { load, resolve } from "./kitchen.mjs";

const header = "appId: com.example.app\n---\n";

const MAESTRO_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
  load().flows,
);

function checkedIn(directory) {
  const dir = join(MAESTRO_DIR, directory);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => {
      const path = join(dir, name);
      return parseFlow(readFileSync(path, "utf8"), path, {
        LINK_PREFIX: "http://localhost:8081",
      });
    });
}

describe("parseFlow", () => {
  it("reads the config document and the command document", () => {
    const flow = parseFlow(`${header}- launchApp\n`, "welcome.yaml");

    assert.equal(flow.config.appId, "com.example.app");
    assert.deepEqual(flow.commands, [
      { name: "launchApp", file: "welcome.yaml" },
    ]);
  });

  it("rejects a flow with no config document, which Maestro also refuses", () => {
    assert.throws(
      () => parseFlow("- launchApp\n", "welcome.yaml"),
      /welcome\.yaml.*---/s,
    );
  });

  it("resolves an id selector to the testID the app renders", () => {
    const [command] = parseFlow(
      `${header}- tapOn:\n    id: welcome-continue-google\n`,
      "welcome.yaml",
    ).commands;

    assert.deepEqual(command.selector, {
      kind: "testId",
      value: "welcome-continue-google",
    });
  });

  it("keeps the text alongside an id, rather than dropping it", () => {
    const [command] = parseFlow(
      `${header}- assertVisible:\n    id: search-save\n    text: Saved\n`,
      "search.yaml",
    ).commands;

    assert.deepEqual(command.selector, {
      kind: "testId",
      value: "search-save",
      text: "Saved",
    });
  });

  it("reads a bare string as the text selector Maestro takes it for", () => {
    const [command] = parseFlow(
      `${header}- assertVisible: Continue with Google\n`,
      "welcome.yaml",
    ).commands;

    assert.deepEqual(command.selector, {
      kind: "text",
      value: "Continue with Google",
    });
  });

  it("reads a point as the fraction of the screen Maestro's percentages name", () => {
    const [command] = parseFlow(
      `${header}- tapOn:\n    point: "25%,50%"\n`,
      "sign.yaml",
    ).commands;

    assert.deepEqual(command.selector, { kind: "point", x: 0.25, y: 0.5 });
  });

  it("refuses a point that is not two percentages", () => {
    assert.throws(
      () => parseFlow(`${header}- tapOn:\n    point: "25,50"\n`, "sign.yaml"),
      /sign\.yaml.*point/s,
    );
  });

  it("refuses a point on a command that cannot tap one", () => {
    for (const command of ["assertVisible", "assertNotVisible"]) {
      assert.throws(
        () =>
          parseFlow(
            `${header}- ${command}:\n    point: "25%,50%"\n`,
            "sign.yaml",
          ),
        /sign\.yaml.*point only works with tapOn/s,
      );
    }
  });

  it("taps a point at that fraction of the viewport", async () => {
    const [command] = parseFlow(
      `${header}- tapOn:\n    point: "25%,50%"\n`,
      "sign.yaml",
    ).commands;
    const clicks = [];
    const page = {
      viewportSize: () => ({ width: 400, height: 800 }),
      mouse: { click: async (x, y) => clicks.push([x, y]) },
    };

    await COMMANDS.tapOn.run(page, command, { timeout: 1000 });

    assert.deepEqual(clicks, [[100, 400]]);
  });

  it("signs a second account in through the auth adapter and loads its cookies into the context", async () => {
    const [command] = parseFlow(
      `${header}- signInAs: dev+second@example.test\n`,
      "second.yaml",
    ).commands;
    const asked = [];
    const added = [];
    const page = {
      context: () => ({
        addCookies: async (cookies) => added.push(cookies),
        request: {
          post: async () => assert.fail("signInAs must not post to the API itself"),
        },
      }),
    };
    const cookies = [{ name: "session", value: "abc", domain: "localhost", path: "/" }];

    await COMMANDS.signInAs.run(page, command, {
      apiUrl: "http://localhost:3000",
      signIn: async (email, apiUrl) => {
        asked.push([email, apiUrl]);
        return { cookies, origins: [] };
      },
    });

    assert.deepEqual(asked, [["dev+second@example.test", "http://localhost:3000"]]);
    assert.deepEqual(added, [cookies]);
  });

  it("sets a signed-in state's local storage before the page's own scripts run, and never over a value the page has since rotated", async () => {
    const [command] = parseFlow(`${header}- signInAs: dev+second@example.test\n`, "second.yaml").commands;
    const scripts = [];
    const page = {
      context: () => ({
        addCookies: async () => {},
        addInitScript: async (script, argument) => scripts.push([script, argument]),
      }),
    };
    const origins = [{ origin: "http://localhost:8081", localStorage: [{ name: "sb-127-auth-token", value: '{"a":1}' }] }];

    await COMMANDS.signInAs.run(page, command, { apiUrl: "http://localhost:3000", signIn: async () => ({ cookies: [], origins }) });

    assert.equal(scripts.length, 1);
    const [script, argument] = scripts[0];
    assert.deepEqual(argument, origins[0]);
    const store = new Map([["sb-other", "x"]]);
    const run = (location) =>
      script.call(undefined, argument, {
        location,
        localStorage: { getItem: (name) => store.get(name) ?? null, setItem: (name, value) => store.set(name, value) },
      });
    run({ origin: "http://elsewhere:1" });
    assert.equal(store.has("sb-127-auth-token"), false);
    run({ origin: "http://localhost:8081" });
    assert.equal(store.get("sb-127-auth-token"), '{"a":1}');
    store.set("sb-127-auth-token", "rotated");
    run({ origin: "http://localhost:8081" });
    assert.equal(store.get("sb-127-auth-token"), "rotated");
  });

  it("asks the auth adapter for a state file of its own, never the one a flow is signed in with", () => {
    const argv = signInArgs("dev+second@example.test", "http://localhost:3000", "/tmp/x.json");
    assert.deepEqual(argv.slice(0, 3), ["auth", "sign-in", "--email"]);
    assert.ok(argv.includes("--out") && argv.includes("/tmp/x.json"));
    assert.ok(argv.includes("--api-url") && argv.includes("http://localhost:3000"));
  });

  it("refuses a signInAs with no email", () => {
    assert.throws(
      () => parseFlow(`${header}- signInAs: nobody\n`, "second.yaml"),
      /email of a seeded dev account/,
    );
  });

  it("reads a swipe's two points as fractions of the screen", () => {
    const [command] = parseFlow(
      `${header}- swipe:\n    start: "10%,20%"\n    end: "90%,80%"\n`,
      "stroke.yaml",
    ).commands;

    assert.deepEqual(command.from, { x: 0.1, y: 0.2 });
    assert.deepEqual(command.to, { x: 0.9, y: 0.8 });
  });

  it("names the flow and command number when a swipe point is missing or malformed", () => {
    for (const body of [
      '    start: "10%,20%"\n',
      '    start: "10%,20%"\n    end: "90,80"\n',
    ]) {
      assert.throws(
        () =>
          parseFlow(`${header}- tapOn: Go\n- swipe:\n${body}`, "stroke.yaml"),
        /stroke\.yaml: command 2: (swipe|point) needs/,
      );
    }
  });

  it("presses at the start, moves to the end in several steps, and releases there", async () => {
    const [command] = parseFlow(
      `${header}- swipe:\n    start: "25%,50%"\n    end: "75%,50%"\n`,
      "stroke.yaml",
    ).commands;
    const events = [];
    const page = {
      viewportSize: () => ({ width: 400, height: 800 }),
      mouse: {
        move: async (x, y, options) => events.push(["move", x, y, options]),
        down: async () => events.push(["down"]),
        up: async () => events.push(["up"]),
      },
    };

    await COMMANDS.swipe.run(page, command, { timeout: 1000 });

    assert.deepEqual(events[0], ["move", 100, 400, undefined]);
    assert.deepEqual(events[1], ["down"]);
    assert.equal(events[2][0], "move");
    assert.deepEqual(events[2].slice(1, 3), [300, 400]);
    assert.ok(events[2][3].steps > 1);
    assert.deepEqual(events[3], ["up"]);
  });

  it("reads the text an inputText types", () => {
    const [command] = parseFlow(
      `${header}- inputText: Delete my account\n`,
      "settings.yaml",
    ).commands;

    assert.equal(command.text, "Delete my account");
  });

  it("refuses an inputText with no text to type", () => {
    assert.throws(
      () => parseFlow(`${header}- inputText\n`, "settings.yaml"),
      /settings\.yaml.*text to type/s,
    );
  });

  it("substitutes env from the config document", () => {
    const [command] = parseFlow(
      "env:\n  LINK_PREFIX: http://localhost:8081\n---\n- openLink: ${LINK_PREFIX}/phrase\n",
      "phrase.yaml",
    ).commands;

    assert.equal(command.link, "http://localhost:8081/phrase");
  });

  it("substitutes env passed in over the config document", () => {
    const [command] = parseFlow(
      "env:\n  LINK_PREFIX: http://localhost:8081\n---\n- openLink: ${LINK_PREFIX}/phrase\n",
      "phrase.yaml",
      { LINK_PREFIX: "example:/" },
    ).commands;

    assert.equal(command.link, "example://phrase");
  });

  it("names the flow and the command index when a command is unknown", () => {
    assert.throws(
      () => parseFlow(`${header}- launchApp\n- swipeLeft\n`, "welcome.yaml"),
      /welcome\.yaml.*command 2.*swipeLeft/s,
    );
  });

  it("keeps refusing a swipe given only a direction", () => {
    for (const step of ["- swipeLeft\n", "- swipe:\n    direction: LEFT\n"]) {
      assert.throws(
        () => parseFlow(`${header}- launchApp\n${step}`, "welcome.yaml"),
        /welcome\.yaml: command 2: `swipe(Left)?` is not a command this runs/,
      );
    }
  });

  it("names an env placeholder nothing defines", () => {
    assert.throws(
      () => parseFlow(`${header}- openLink: \${NOWHERE}/home\n`, "home.yaml"),
      /NOWHERE/,
    );
  });

  it("gives extendedWaitUntil its own timeout, so a slow screen outlasts the run's", () => {
    const [command] = parseFlow(
      `${header}- extendedWaitUntil:\n    visible:\n      id: ocr-harness-done\n    timeout: 30000\n`,
      "ocr-harness.yaml",
    ).commands;

    assert.deepEqual(command.selector, {
      kind: "testId",
      value: "ocr-harness-done",
    });
    assert.equal(command.timeout, 30_000);
  });

  it("leaves an extendedWaitUntil without a timeout on the run's own", () => {
    const [command] = parseFlow(
      `${header}- extendedWaitUntil:\n    visible:\n      id: ocr-harness-done\n`,
      "ocr-harness.yaml",
    ).commands;

    assert.equal(command.timeout, undefined);
  });

  it("names the flow when an extendedWaitUntil waits for nothing", () => {
    assert.throws(
      () =>
        parseFlow(
          `${header}- extendedWaitUntil:\n    notVisible:\n      id: spinner\n`,
          "ocr-harness.yaml",
        ),
      /ocr-harness\.yaml.*visible/s,
    );
  });

  it("reads a runFlow's file and env", () => {
    const [command] = parseFlow(
      `${header}- runFlow:\n    file: shared/ask.yaml\n    env:\n      QUESTION: "Ask 1?"\n`,
      "tutor-refused-without-credits.yaml",
    ).commands;

    assert.equal(command.path, "shared/ask.yaml");
    assert.deepEqual(command.envOverrides, { QUESTION: "Ask 1?" });
  });

  it("reads a bare-string runFlow as its file, with no env", () => {
    const [command] = parseFlow(
      `${header}- runFlow: shared/ask.yaml\n`,
      "tutor-refused-without-credits.yaml",
    ).commands;

    assert.equal(command.path, "shared/ask.yaml");
    assert.deepEqual(command.envOverrides, {});
  });

  it("refuses a runFlow with no file to run", () => {
    assert.throws(
      () =>
        parseFlow(`${header}- runFlow:\n    env:\n      X: "1"\n`, "x.yaml"),
      /x\.yaml.*file.*to run/s,
    );
  });

  it("reads scrollUntilVisible's element as the selector to bring into view", () => {
    const [command] = parseFlow(
      `${header}- scrollUntilVisible:\n    element:\n      id: dictionary-kanji-label\n`,
      "gloss.yaml",
    ).commands;

    assert.equal(command.name, "scrollUntilVisible");
    assert.deepEqual(command.selector, {
      kind: "testId",
      value: "dictionary-kanji-label",
    });
  });

  it("rejects scrollUntilVisible with no element", () => {
    assert.throws(
      () =>
        parseFlow(
          `${header}- scrollUntilVisible:\n    direction: DOWN\n`,
          "gloss.yaml",
        ),
      /gloss\.yaml.*element/s,
    );
  });

  it("takes tags from the config document, which decide the preconditions", () => {
    const flow = parseFlow(
      "appId: com.example.app\ntags:\n  - signed-in\n---\n- launchApp\n",
      "home.yaml",
    );

    assert.deepEqual(flow.config.tags, ["signed-in"]);
  });
});

describe("the files checked in under .maestro", () => {
  it("parses every flow, so every command in one is a command this runner implements", () => {
    assert.ok(checkedIn("flows").length >= 6);
  });

  it("parses every check, which the same runner drives", () => {
    assert.ok(checkedIn("checks").length >= 1);
  });

  it("taps no tab, since the app has no tab bar", () => {
    const tabTaps = [...checkedIn("flows"), ...checkedIn("checks")].flatMap(
      (flow) =>
        flow.commands
          .filter(
            (c) =>
              c.selector?.kind === "testId" && /^tab-/.test(c.selector.value),
          )
          .map((c) => `${c.file.split("/.maestro/")[1]} → ${c.selector.value}`),
    );

    assert.deepEqual(tabTaps, []);
  });

  it("leaves no command in this runner that no flow or check reaches for", () => {
    const used = new Set(
      [...checkedIn("flows"), ...checkedIn("checks")].flatMap((flow) =>
        flow.commands.map((c) => c.name),
      ),
    );

    assert.deepEqual(
      Object.keys(COMMANDS).filter((name) => !used.has(name)),
      [],
    );
  });
});

describe("addMedia", () => {
  const flow = `${header}- addMedia:\n    - ../fixtures/a.jpg\n    - ../fixtures/b.jpg\n`;

  it("reads the list of files the flow hands the picker", () => {
    const [command] = parseFlow(flow, "/repo/.maestro/checks/pick.yaml").commands;

    assert.equal(command.name, "addMedia");
    assert.deepEqual(command.paths, ["../fixtures/a.jpg", "../fixtures/b.jpg"]);
  });

  it("refuses an addMedia with no files", () => {
    assert.throws(
      () => parseFlow(`${header}- addMedia\n`, "pick.yaml"),
      /pick\.yaml.*addMedia/s,
    );
  });

  it("answers the next file chooser with those files, resolved from the flow's folder", async () => {
    const [command] = parseFlow(flow, "/repo/.maestro/checks/pick.yaml").commands;
    let handler;
    const page = { once: (event, fn) => (handler = { event, fn }) };

    await COMMANDS.addMedia.run(page, command, {});

    assert.equal(handler.event, "filechooser");
    const chosen = [];
    await handler.fn({ setFiles: async (files) => chosen.push(...files) });
    assert.deepEqual(chosen, [
      "/repo/.maestro/fixtures/a.jpg",
      "/repo/.maestro/fixtures/b.jpg",
    ]);
  });
});

describe("surface", () => {
  const kitchen = resolve({
    repo: "someone/app",
    humans: { default: "someone" },
    expo: { webPort: 19006, viewport: { width: 412, height: 915 }, apiUrlEnv: "APP_API" },
  });

  it("opens the web port and the viewport kitchen.json names", () => {
    const { url, viewport } = surface(kitchen, {});
    assert.equal(url, "http://localhost:19006");
    assert.deepEqual(viewport, { width: 412, height: 915 });
  });

  it("takes the API from the env var kitchen.json names", () => {
    assert.equal(surface(kitchen, { APP_API: "http://api.test/" }).apiUrl, "http://api.test");
  });
});

describe("carriesSession", () => {
  const APP = "http://localhost:8081";

  it("accepts a state whose only session is a cookie, whatever it is called", () => {
    assert.equal(carriesSession({ cookies: [{ name: "app.session_token", value: "abc" }] }), true);
    assert.equal(carriesSession({ cookies: [{ name: "__Secure-app.sid", value: "abc" }] }), true);
    assert.equal(carriesSession({ cookies: [{ name: "theme", value: "dark" }] }), true);
  });

  it("accepts a state whose only session is a local storage entry, whatever it is called", () => {
    assert.equal(carriesSession({ cookies: [], origins: [{ origin: APP, localStorage: [{ name: "sb-127-auth-token", value: "{}" }] }] }), true);
    assert.equal(carriesSession({ cookies: [], origins: [{ origin: APP, localStorage: [{ name: "whatever", value: "1" }] }] }), true);
  });

  it("rejects the empty state a project with no auth writes", () => {
    assert.equal(carriesSession({ cookies: [], origins: [] }), false);
  });

  it("rejects a state with no cookies and no origins at all", () => {
    assert.equal(carriesSession({}), false);
  });

  it("rejects an origin that holds no local storage entry", () => {
    assert.equal(carriesSession({ cookies: [], origins: [{ origin: APP, localStorage: [] }] }), false);
    assert.equal(carriesSession({ cookies: [], origins: [{ origin: APP }] }), false);
  });

  it("counts local storage only under the app's origin when it is given one", () => {
    const state = { cookies: [], origins: [{ origin: "http://localhost:9999", localStorage: [{ name: "k", value: "1" }] }] };
    assert.equal(carriesSession(state, APP), false);
    assert.equal(carriesSession(state, "http://localhost:9999"), true);
  });

  it("counts a cookie whatever origin it is given", () => {
    assert.equal(carriesSession({ cookies: [{ name: "k", value: "1" }] }, APP), true);
  });
});

describe("selectFlowFiles", () => {
  it("keeps only what a pattern names, in a stable order", () => {
    assert.deepEqual(
      selectFlowFiles(
        ["flows/words.yaml", "config.yaml", "flows/home.yaml", "notes.md"],
        ["flows/*.yaml"],
      ),
      ["flows/home.yaml", "flows/words.yaml"],
    );
  });

  it("does not let a single star cross a directory boundary", () => {
    assert.deepEqual(selectFlowFiles(["flows/home.yaml"], ["*.yaml"]), []);
  });

  it("crosses any depth for a double star", () => {
    assert.deepEqual(
      selectFlowFiles(["checks/snap-word-sheet.yaml"], ["**/*.yaml"]),
      ["checks/snap-word-sheet.yaml"],
    );
  });
});

describe("flowPaths", () => {
  it("takes a single file as itself", async () => {
    const flow = join(MAESTRO_DIR, "flows/home.yaml");

    assert.deepEqual(await flowPaths(flow), [flow]);
  });

  it("reads .maestro as the flows its config.yaml lists, leaving the checks out", async () => {
    const paths = await flowPaths(MAESTRO_DIR);

    assert.ok(paths.length >= 6);
    assert.ok(paths.every((path) => path.includes("flows")));
    assert.ok(paths.some((path) => path.endsWith("home.yaml")));
    assert.equal(
      paths.some((path) => path.endsWith("config.yaml")),
      false,
    );
  });

  it("reads a directory with no config.yaml as the files directly in it", async () => {
    const paths = await flowPaths(join(MAESTRO_DIR, "checks"));

    assert.ok(paths.length >= 1);
    assert.ok(paths.every((path) => path.endsWith(".yaml")));
  });
});

describe("installSpeechStub", () => {
  function fakeWindow() {
    return { speechSynthesis: { speaking: false } };
  }

  it("offers one voice in the language it was given", () => {
    const window = fakeWindow();
    installSpeechStub(window, "ja-JP");

    const voices = window.speechSynthesis.getVoices();
    assert.equal(voices.length, 1);
    assert.equal(voices[0].lang, "ja-JP");
  });

  it("starts speaking and keeps speaking until cancelled", () => {
    const window = fakeWindow();
    installSpeechStub(window, "ja-JP");
    let started = false;

    window.speechSynthesis.speak({ onstart: () => (started = true) });
    assert.equal(started, true);
    assert.equal(window.speechSynthesis.speaking, true);

    window.speechSynthesis.cancel();
    assert.equal(window.speechSynthesis.speaking, false);
  });
});

describe("parseArgs --color-scheme", () => {
  it("takes the scheme the page should emulate", () => {
    assert.equal(
      parseArgs(["flow.yaml", "--color-scheme", "dark"]).colorScheme,
      "dark",
    );
  });

  it("leaves the browser's own scheme alone when the flag is absent", () => {
    assert.equal(parseArgs(["flow.yaml"]).colorScheme, undefined);
  });

  it("refuses a scheme the browser cannot emulate", () => {
    assert.throws(
      () => parseArgs(["flow.yaml", "--color-scheme", "sepia"]),
      /light or dark/,
    );
  });
});
