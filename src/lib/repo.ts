import { $ } from "zx";

export const getRepoRoot = async (): Promise<string> => {
  try {
    const result = await $`jj workspace root`.quiet();
    return result.stdout.trim();
  } catch {
    throw new Error("Could not find jj in this repository, has it been initialized?");
  }
};
