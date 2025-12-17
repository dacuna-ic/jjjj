import { Command, Flags } from "@oclif/core";
import pMap from "p-map";
import { $, chalk } from "zx";
import { getGhConstants, octokit } from "../lib/github.js";
import { abandon, fetch, getBookmarks } from "../lib/jj.js";

export default class Restack extends Command {
  static override description =
    "Restack revisions onto trunk, cleaning up closed PRs";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --all",
  ];

  static override flags = {
    all: Flags.boolean({
      description: "restack all mutable revisions instead of just current",
    }),
  };

  public async run(): Promise<void> {
    const { owner, repo } = await getGhConstants();
    const { flags } = await this.parse(Restack);

    $.quiet = true;

    await fetch();
    const bookmarks = await getBookmarks();

    const prs = await pMap(
      bookmarks,
      async (bookmark) =>
        octokit.rest.pulls
          .list({
            owner,
            repo,
            state: "closed",
            per_page: 1,
            head: `${owner}:${bookmark}`,
          })
          .then((r) => r.data.at(0)),
      { concurrency: 10 },
    );

    await pMap(prs.filter(Boolean), (pr) => abandon(pr?.head.ref, false), {
      concurrency: 1,
    });

    const revisions = ["-r", flags.all ? "mutable()" : "@"];

    // Note we don't use the `log` util since it uses --no-graph which breaks its expectations, as we basically want multiple ranges instead of just one
    const allBranchRootsOutput =
      await $`jj log --quiet ${revisions} --template="change_id"`.text();

    const allBranchRoots = allBranchRootsOutput
      .split("~")
      .filter(Boolean)
      .map((s) =>
        s
          .split("\n")
          .map((s) => s.substring(3).trim())
          .filter(Boolean)
          // Only pick the root revision of each chain
          .at(-1),
      )
      .filter(Boolean);

    for (const root of allBranchRoots) {
      await $`jj rebase -s ${root} -d "trunk()"`;
      this.log(chalk.green("restacked"), root);
    }
  }
}
