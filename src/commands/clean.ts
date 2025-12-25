import { Command } from "@oclif/core";
import { $ } from "zx";

export default class Clean extends Command {
  static override description = "Abandon mutable empty revisions";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  public async run(): Promise<void> {
    await $`jj abandon -r 'mutable() & empty()'`;
  }
}
