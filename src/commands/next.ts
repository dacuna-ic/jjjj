import { Command } from "@oclif/core";
import { $ } from "zx";

export default class Next extends Command {
	static override description = "Move to the next revision and edit it";

	static override examples = ["<%= config.bin %> <%= command.id %>"];

	public async run(): Promise<void> {
		await $`jj next --edit`;
	}
}
