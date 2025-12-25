import type { Hook } from "@oclif/core";
import { runJj } from "../../../services/passthrough.js";

const hook: Hook.CommandNotFound = async (_) => {
	await runJj();
};

export default hook;
