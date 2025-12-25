import { input, select, checkbox } from "@inquirer/prompts";
import { Command } from "@oclif/core";
import { $ } from "zx";
import { describeChanges } from "../services/ai/agents/describer.js";
import { getStatus } from "../lib/jj.js";

export default class Aidesc extends Command {
	static override description =
		"Generate AI-powered commit descriptions based on current changes";

	static override examples = ["<%= config.bin %> <%= command.id %>"];

	public async run(): Promise<void> {
		const changes = await getStatus();

		const selectedChanges = await checkbox({
			message: "Select the main changes to include in the context:",
			choices: changes.map((change) => ({
				name: `${change.type} ${change.path}`,
				value: change,
			})),
		});

		const diff = await $`jj diff --git ${selectedChanges.map(
			(change) => change.path,
		)}`.text();

		if (!diff) {
			this.error("No changes found, exiting...");
		}

		const extraContext = await input({
			message: "Extra context:",
			required: false,
		});

		const message = await describeChanges(diff, extraContext || undefined);

		const options = message
			.split("\n")
			.map((line: string) => line.trim())
			.filter(Boolean);

		const selectedOption = await select({
			message: "Select an option:",
			choices: options,
		});

		await $`jj describe -m ${selectedOption}`;
	}
}
