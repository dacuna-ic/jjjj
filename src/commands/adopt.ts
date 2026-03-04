import { Command } from "@oclif/core";
import { $ } from "zx";
import { getRevisions } from "../lib/jj.js";

export default class Adopt extends Command {
  static override description = "Move the nearest ancestor bookmark to the current revision";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  public async run(): Promise<void> {
    const revs = await getRevisions("fork_point(trunk()..@)::@");

    // revs are ordered root→tip, current (@) is last
    // search backwards from second-to-last (skip @) for first with bookmark
    const donor = revs
      .slice(0, -1)
      .reverse()
      .find((r) => r.bookmark);

    if (!donor) {
      this.log("No ancestor bookmark found to adopt");
      return;
    }

    await $`jj bookmark set -r @ ${donor.bookmark} --allow-backwards`;
    this.log(`Moved bookmark ${donor.bookmark} from ${donor.shortChangeId} to @`);
  }
}
