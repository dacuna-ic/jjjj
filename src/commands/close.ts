import { checkbox } from "@inquirer/prompts";
import { Command, Flags } from "@oclif/core";
import pMap from "p-map";
import { $ } from "zx";
import { getGhConstants, getPRByBranchName, octokit } from "../lib/github.js";
import { getRevisions } from "../lib/jj.js";

export default class Close extends Command {
  static override description = "Close pull requests in the stack";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    '<%= config.bin %> <%= command.id %> --revisions "fork_point(trunk()..@)::@"',
  ];

  static override flags = {
    revisions: Flags.string({
      char: "r",
      description: "revision set to close PRs for",
      default: "fork_point(trunk()..@)::@",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "skip confirmation and close all selected PRs",
      default: false,
    }),
    abandon: Flags.boolean({
      char: "a",
      description: "also abandon the revisions after closing PRs",
      default: true,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Close);
    const { owner, repo } = await getGhConstants();

    const revs = await getRevisions(flags.revisions);

    // Get PRs for all revisions that have bookmarks
    const revsWithPrs = await pMap(
      revs.filter((rev) => rev.bookmark),
      async (rev) => {
        const pr = await getPRByBranchName(rev.bookmark!);
        return { rev, pr };
      },
      { concurrency: 10 },
    );

    // Filter to only open PRs, reversed so top of stack appears first
    const openPrs = revsWithPrs.filter(({ pr }) => pr && pr.state === "open").reverse();

    if (openPrs.length === 0) {
      this.log("No open PRs found in the stack.");
      return;
    }

    let prsToClose = openPrs;

    if (!flags.yes) {
      const selected = await checkbox({
        message: "Select PRs to close:",
        choices: openPrs.map(({ rev, pr }) => ({
          name: `#${pr!.number} - ${rev.description || rev.shortChangeId}`,
          value: { rev, pr },
          checked: true, // Default: all selected
        })),
      });

      prsToClose = selected;
    }

    if (prsToClose.length === 0) {
      this.log("No PRs selected.");
      return;
    }

    // Close selected PRs
    await pMap(
      prsToClose,
      async ({ pr }) => {
        await octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: pr!.number,
          state: "closed",
        });
        this.log(`Closed PR #${pr!.number}`);
      },
      { concurrency: 5 },
    );

    this.log(`\nClosed ${prsToClose.length} PR(s).`);

    // Abandon revisions if requested
    if (flags.abandon) {
      const changeIds = prsToClose.map(({ rev }) => rev.changeId);
      await $`jj abandon ${changeIds}`;
      this.log(`Abandoned ${changeIds.length} revision(s).`);
    }
  }
}
