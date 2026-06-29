import { Command } from "@oclif/core";
import { $ } from "zx";
import { getRevisions } from "../lib/jj.js";

export default class Checkpoint extends Command {
  static override description =
    "Create a new commit, move the ancestor bookmark to it, and mark the prior commit as wip";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  public async run(): Promise<void> {
    const revs = await getRevisions("fork_point(trunk()..@)::@");

    // find nearest ancestor with a bookmark (including @)
    const donor = [...revs].reverse().find((r) => r.bookmark);

    if (!donor) {
      this.log("No ancestor bookmark found");
      return;
    }

    const bookmark = donor.bookmark!;

    // create a new commit on top of @
    await $`jj new`;

    // move the bookmark to the new @
    await $`jj bookmark set -r @ ${bookmark} --allow-backwards`;

    // prefix the old commit's description with "wip: " if not already
    const prev = (await getRevisions("@-::@-"))[0];
    if (prev && prev.description && !prev.description.startsWith("wip")) {
      await $`jj describe -r @- -m ${`wip: ${prev.description}`}`;
    }

    this.log(`Checkpointed: moved ${bookmark} to new @, marked @- as wip`);
  }
}
