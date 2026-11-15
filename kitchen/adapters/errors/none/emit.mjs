import { emit } from "../emit.mjs";

const REASON = {
  top: "the Fix loop is off: adapters.errors is none, so there is no tracker to read",
  search: "error tracking is off: adapters.errors is none, so nothing was searched",
};

const [action] = process.argv.slice(2);

emit({ slot: "errors", adapter: "none", action, enabled: false, reason: REASON[action] });
