import { Command, Flags } from "@oclif/core";
import { $ } from "zx";

export default class Stack extends Command {
  static override description = "Show the current stack from fork point to current revision";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    '<%= config.bin %> <%= command.id %> --revisions "fork_point(trunk())::@"',
  ];

  static override flags = {
    revisions: Flags.string({
      char: "r",
      description: "revision set to display",
      default: "fork_point(trunk())::@",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Stack);

    const output = await $`jj --quiet --color always log -r ${flags.revisions}`.text();

    this.log(output.trim());
  }
}
