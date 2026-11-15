const WINDOW = /^(\d+)d$/;

export const DEFAULT_DAYS = { top: 7, search: 30 };

export function windowFrom(args, action) {
  const index = args.indexOf("--window");
  if (index === -1) return days(DEFAULT_DAYS[action]);
  const match = WINDOW.exec(args[index + 1] ?? "");
  const count = match ? Number(match[1]) : 0;
  if (count < 1 || count > 365) {
    process.stderr.write("--window takes a number of days from 1 to 365, such as 14d\n");
    process.exit(2);
  }
  return days(count);
}

const days = (count) => ({ days: count, from: `-${count}d` });

export function settings() {
  const given = process.env.KITCHEN_ADAPTER;
  if (!given) {
    process.stderr.write("run this through .claude/kitchen/scripts/adapter.mjs, which hands it kitchen.json's settings\n");
    process.exit(1);
  }
  return JSON.parse(given).settings;
}

export function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
