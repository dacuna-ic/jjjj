import { fs, path, $, chalk } from "zx";

const binDir = path.join(import.meta.dirname, "bin");
const binFile = path.join(process.env.HOME, ".local/bin/j");

console.log(chalk.yellow("Cleaning up earlier builds..."));
await fs.rm(path.join(import.meta.dirname, "dist"), { recursive: true }).catch(() => {});

console.log(chalk.yellow("Building..."));
await $`npx tsc --pretty`.verbose(true);

console.log(chalk.yellow("Installing shim script..."));
fs.writeFileSync(
  binFile,
  `#!/bin/sh

${path.join(binDir, "./run.js")} $@`,
);

// Explicitly set executable permissions
fs.chmodSync(binFile, 0o755);

console.log(chalk.green(`Installed j to ${binFile}`));
