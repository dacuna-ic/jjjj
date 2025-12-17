import { Command } from "@oclif/core";
import { $ } from "zx";
import { getRevisions } from "../lib/jj.js";

export default class Bot extends Command {
	static override description = "Edit the bottom revision in the stack";

	static override examples = ["<%= config.bin %> <%= command.id %>"];

	public async run(): Promise<void> {
		const revisions = await getRevisions();
		const bottom = revisions.at(0);

		if (!bottom) {
			this.error("Could not resolve bottom revision");
		}

		await $`jj edit ${bottom.changeId}`;
	}
}
