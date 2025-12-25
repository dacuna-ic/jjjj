import { Command } from "@oclif/core";
import { $ } from "zx";
import { getPRByBranchName } from "../lib/github.js";
import { getRevisions } from "../lib/jj.js";

export default class Pr extends Command {
  static override description = "Open the pull request for the current revision";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  public async run(): Promise<void> {
    const [currentRev] = await getRevisions("@");

    if (!currentRev) {
      this.error("Could not resolve current revision");
    }

    if (!currentRev.bookmark) {
      this.error("Current revision has no bookmark");
    }

    const pr = await getPRByBranchName(currentRev.bookmark);

    if (!pr) {
      this.error(`No PR found for branch: ${currentRev.bookmark}`);
    }

    await $`open ${pr.html_url}`;
  }
}
