import path from "node:path";
import { findUp, pathExists } from "find-up";

export const getRepoRoot = async (): Promise<string> => {
	const repoRoot = await findUp(
		async (dir) => {
			const exists = await pathExists(path.join(dir, ".git/refs/jj"));
			return exists ? dir : undefined;
		},
		{ type: "directory" },
	);

	if (!repoRoot) {
		throw new Error(
			"Could not find jj in this repository, has it been initialized?",
		);
	}

	return repoRoot;
};
