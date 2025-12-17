import { Args, Command } from "@oclif/core";
import { $ } from "zx";

export default class Pull extends Command {
	static override args = {
		branch: Args.string({ description: "branch name to pull", required: true }),
	};

	static override description =
		"Create a new revision based on a branch from origin";

	static override examples = [
		"<%= config.bin %> <%= command.id %> main",
		"<%= config.bin %> <%= command.id %> feature-branch",
	];

	public async run(): Promise<void> {
		const { args } = await this.parse(Pull);

		await $`jj new ${args.branch}@origin`;
	}
}
