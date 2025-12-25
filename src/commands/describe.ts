import { input } from "@inquirer/prompts";
import { Command, Flags } from "@oclif/core";
import { $ } from "zx";

export default class Describe extends Command {
  static override description = "Describe the current revision with a commit message";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    '<%= config.bin %> <%= command.id %> --message "Fix bug in parser"',
  ];

  static override flags = {
    message: Flags.string({ char: "m", description: "commit message" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Describe);

    let message = flags.message;
    if (!message) {
      message = await input({
        message: "Commit description:",
      });
    }

    await $`jj describe -m ${message}`;
  }
}
