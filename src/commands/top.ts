import { Command, Flags } from "@oclif/core";
import { $ } from "zx";
import { getRevisions } from "../lib/jj.js";

export default class Top extends Command {
  static override description = "Edit the top revision in the stack";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    '<%= config.bin %> <%= command.id %> --revisions "fork_point(trunk())::@"',
  ];

  static override flags = {
    revisions: Flags.string({
      char: "r",
      description: "revision set to get top from",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Top);

    const revisions = await getRevisions(flags.revisions);
    const top = revisions.at(-1);

    if (!top) {
      this.error("Could not resolve top revision");
    }

    await $`jj edit ${top.changeId}`;
  }
}
