const SCHEMES = ["light", "dark", "no-preference"];

export function parseArgs(argv) {
  const args = {
    click: [],
    act: [],
    localStorage: [],
    waitFor: [],
    width: 390,
    height: 844,
    wait: 2000,
    mobile: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--full-page") {
      args.fullPage = true;
      continue;
    }
    if (key === "--desktop") {
      args.width = 1440;
      args.height = 900;
      args.mobile = false;
      continue;
    }
    const value = argv[++i];
    if (key === "--click") args.click.push(value);
    else if (key === "--act") args.act.push(value);
    else if (key === "--local-storage") args.localStorage.push(splitPair(value));
    else if (key === "--color-scheme") args.colorScheme = scheme(value);
    else if (key === "--wait-for") args.waitFor.push(value);
    else if (key === "--url") args.url = value;
    else if (key === "--out") args.out = value;
    else if (key === "--state") args.state = value;
    else if (key === "--save-state") args.saveState = value;
    else if (key === "--width") args.width = Number(value);
    else if (key === "--height") args.height = Number(value);
    else if (key === "--wait") args.wait = Number(value);
    else throw new Error(`unknown argument: ${key}`);
  }
  if (!args.url || !args.out) throw new Error("--url and --out are required");
  return args;
}

function splitPair(value) {
  const at = String(value).indexOf("=");
  if (at < 1) throw new Error(`--local-storage wants key=value, got: ${value}`);
  return [value.slice(0, at), value.slice(at + 1)];
}

function scheme(value) {
  if (!SCHEMES.includes(value)) {
    throw new Error(`--color-scheme is one of ${SCHEMES.join(", ")}, got: ${value}`);
  }
  return value;
}
