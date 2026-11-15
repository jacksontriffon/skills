// Screenshot a page for /design-review.
//
//   node .claude/kitchen/scripts/capture.mjs \
//     --url http://localhost:8081/login --out shot.png \
//     --click "Continue with Google" --save-state .claude/tmp/auth.json
//
//   --url          page to open (required)
//   --out          PNG path to write (required)
//   --width        viewport width, default 390 (iPhone 15 logical width)
//   --height       viewport height, default 844
//   --desktop      shorthand for 1440x900, no touch — for the design export, not the app
//   --click        click the topmost element showing this text (a dialog button wins over the item beneath it); repeatable, applied in order.
//                  `@cam:shoot` clicks the element whose data-act is `cam:shoot`, for
//                  the design export's icon-only controls, which carry no text
//   --act          click the first visible [data-act="…"]; repeatable, applied after --click
//   --local-storage key=value, set before the page's own scripts run; repeatable
//   --color-scheme light | dark | no-preference, the browser's prefers-color-scheme
//   --wait-for     CSS selector to await before capturing; repeatable
//   --wait         extra milliseconds to settle before capturing, default 2000
//   --full-page    capture the full scrollable page rather than the viewport
//   --state        load a saved storageState (skips signing in again)
//   --save-state   write storageState here after the clicks
//
// Set CHROMIUM_EXECUTABLE to force a particular browser binary. Left unset, the
// launch falls back to any chromium already under PLAYWRIGHT_BROWSERS_PATH when the
// build this playwright pins is absent — agent containers ship a preinstalled
// chromium whose build number rarely matches the pin, and `playwright install` is
// both a fresh download every session and often blocked outright.
//
// The app side is Expo web, so the default viewport is a phone: React Native Web
// emits the same layout the device does, and shooting it at 1440 wide reports every
// responsive stretch as a deviation. The design export is a desktop artboard — pass
// --desktop for that side.
//
// Metro holds an HMR websocket open for the life of the page, so `networkidle` never
// arrives. Readiness is `load` plus --wait-for/--wait instead. The first capture after
// dev-server.sh start also pays for Metro's on-demand bundle, which is why --wait
// starts higher than a browser page needs.
//
// PNG rather than JPEG or WebP on purpose: lossy artifacts around text and
// edges read as design deviations that aren't there.
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

import { parseArgs } from "./capture-args.mjs";

const args = parseArgs(process.argv.slice(2));

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
  const forced = process.env.CHROMIUM_EXECUTABLE;
  if (forced) return chromium.launch({ executablePath: forced });
  try {
    return await chromium.launch();
  } catch (error) {
    const fallback = await findInstalledChromium();
    if (!fallback) throw error;
    console.error(`playwright's own chromium is missing; using ${fallback}`);
    return chromium.launch({ executablePath: fallback });
  }
}

const browser = await launch();
const context = await browser.newContext({
  viewport: { width: args.width, height: args.height },
  deviceScaleFactor: args.mobile ? 3 : 2,
  isMobile: args.mobile,
  hasTouch: args.mobile,
  storageState: args.state,
  colorScheme: args.colorScheme,
});
if (args.localStorage.length) {
  await context.addInitScript((pairs) => {
    for (const [key, value] of pairs) window.localStorage.setItem(key, value);
  }, args.localStorage);
}
const page = await context.newPage();

async function settle() {
  for (const selector of args.waitFor) {
    await page.waitForSelector(selector, { timeout: 60_000 });
  }
  await page.waitForTimeout(args.wait);
}

async function topmostMatch(text) {
  const matches = page.getByText(text, { exact: false });
  const count = await matches.count();
  for (let i = count - 1; i >= 0; i--) {
    const candidate = matches.nth(i);
    const hit = await candidate
      .evaluate((el) => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        const top = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return top !== null && el.contains(top);
      })
      .catch(() => false);
    if (hit) return candidate;
  }
  return matches.first();
}

async function clickAct(act) {
  const matches = page.locator(`[data-act="${act.replaceAll('"', '\\"')}"]`);
  const count = await matches.count();
  for (let i = 0; i < count; i++) {
    const candidate = matches.nth(i);
    if (!(await candidate.isVisible())) continue;
    try {
      await candidate.click({ timeout: 1500 });
      return;
    } catch {
      continue;
    }
  }
  throw new Error(`no clickable [data-act="${act}"] (${count} in the DOM)`);
}

try {
  const steps = [
    ...args.click.map((text) =>
      text.startsWith("@")
        ? () => clickAct(text.slice(1))
        : async () => (await topmostMatch(text)).click(),
    ),
    ...args.act.map((act) => () => clickAct(act)),
  ];

  await page.goto(args.url, { waitUntil: "load", timeout: 120_000 });
  await settle();

  for (const step of steps) {
    await step();
    await settle();
  }

  await mkdir(dirname(args.out), { recursive: true });
  await page.screenshot({ path: args.out, fullPage: Boolean(args.fullPage) });

  if (args.saveState) {
    const state = await context.storageState();
    // Sign-in redirects on the client, so `load` resolves before the session is
    // stored. Saving anyway yields a state that loads the login page under --state,
    // and every later capture shoots the wrong screen. The app is served from Expo
    // on one origin and the auth server answers from another, so the credential shows up
    // as a cookie or as web storage depending on which side wrote it — accept either,
    // and say what was found when neither is there.
    const cookies = state.cookies.map((c) => c.name);
    const stored = state.origins.flatMap((o) =>
      (o.localStorage ?? []).map((e) => e.name),
    );
    const looksSignedIn = [...cookies, ...stored].some((name) =>
      /session|token/i.test(name),
    );
    if (!looksSignedIn) {
      throw new Error(
        `no session credential after ${args.click.length} click(s); ` +
          `saved state would not be signed in. Cookies: ` +
          `${cookies.join(", ") || "(none)"}. Storage: ` +
          `${stored.join(", ") || "(none)"}. Raise --wait and try again.`,
      );
    }
    await mkdir(dirname(args.saveState), { recursive: true });
    await context.storageState({ path: args.saveState });
  }

  console.log(args.out);
} finally {
  await browser.close();
}
