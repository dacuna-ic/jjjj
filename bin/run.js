#!/usr/bin/env node

import { runJj } from "../dist/services/passthrough.js";
import path from "node:path";
import { globby } from "zx";

let args;
const commands = await globby(
  path.join(import.meta.dirname, "../dist/commands/*"),
).then((results) => results.map((s) => path.basename(s, ".js")));

commands.push("--help");

if (!commands.includes(process.argv.at(2))) {
  await runJj();
}

(async () => {
  const { execute } = await import("@oclif/core");
  await execute({ dir: import.meta.url, args });
})();
