import { confirm } from "@inquirer/prompts";
import { Command, Flags } from "@oclif/core";
import pMap from "p-map";
import { $ } from "zx";
import {
  getGhConstants,
  getNativeStackByPRNumber,
  getPRByBranchName,
  octokit,
} from "../../lib/github.js";
import type { NativeStack } from "../../lib/github.js";
import { getRevisions } from "../../lib/jj.js";
type AssociatedPullRequest = {
  number: number;
  state: "open" | "closed";
  head: { ref: string };
};

$.quiet = true;

export default class Destroy extends Command {
  static override description =
    "Close the stack's pull requests, delete its remote branches, and forget its bookmarks";

  static override examples = [
    "<%= config.bin %> stack destroy",
    '<%= config.bin %> stack destroy --yes --revisions "fork_point(trunk())::@"',
  ];

  static override flags = {
    revisions: Flags.string({
      char: "r",
      description: "revision set whose PRs and bookmarks should be destroyed",
      default: "fork_point(trunk())::@",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "skip confirmation and destroy all associated PRs and bookmarks",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Destroy);
    const { owner, repo } = await getGhConstants();
    const revisions = await getRevisions(flags.revisions);
    const pullRequestsByNumber = new Map<number, AssociatedPullRequest>();
    const branches = new Set(
      revisions
        .map((revision) => revision.bookmark)
        .filter((bookmark): bookmark is string => !!bookmark),
    );

    await pMap(
      revisions.filter((revision) => revision.bookmark),
      async (revision) => {
        const pullRequest = await getPRByBranchName(revision.bookmark!);
        if (pullRequest) {
          pullRequestsByNumber.set(pullRequest.number, {
            number: pullRequest.number,
            state: pullRequest.state === "open" ? "open" : "closed",
            head: { ref: pullRequest.head.ref },
          });
        }
      },
      { concurrency: 10 },
    );

    let nativeStack: NativeStack | undefined;
    for (const pullRequest of pullRequestsByNumber.values()) {
      const candidate = await getNativeStackByPRNumber(pullRequest.number);
      if (!candidate) continue;
      if (nativeStack && candidate.number !== nativeStack.number) {
        throw new Error(
          `The selected revisions belong to multiple GitHub stacks (#${nativeStack.number} and #${candidate.number})`,
        );
      }
      nativeStack = candidate;
    }

    if (nativeStack) {
      await pMap(
        nativeStack.pull_requests,
        async ({ number, head }) => {
          branches.add(head.ref);
          if (pullRequestsByNumber.has(number)) return;

          const { data: pullRequest } = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: number,
          });
          pullRequestsByNumber.set(number, {
            number: pullRequest.number,
            state: pullRequest.state === "open" ? "open" : "closed",
            head: { ref: pullRequest.head.ref },
          });
        },
        { concurrency: 10 },
      );
    }

    const pullRequests = [...pullRequestsByNumber.values()];
    const openPullRequests = pullRequests.filter((pullRequest) => pullRequest.state === "open");
    const localBookmarkOutput = await $`jj bookmark list --template=${'name ++ "\\n"'}`.text();
    const localBookmarks = new Set(localBookmarkOutput.split("\n").filter(Boolean));
    const bookmarksToForget = [...branches].filter((branch) => localBookmarks.has(branch));

    if (pullRequests.length === 0 && branches.size === 0) {
      this.log("No pull requests or bookmarks found in the selected revisions.");
      return;
    }

    if (!flags.yes) {
      const confirmed = await confirm({
        message: `Close ${openPullRequests.length} PR(s), delete ${branches.size} remote branch(es), and forget ${bookmarksToForget.length} local bookmark(s)?`,
        default: false,
      });
      if (!confirmed) {
        this.log("Stack destroy cancelled.");
        return;
      }
    }

    await pMap(
      openPullRequests,
      async (pullRequest) => {
        await octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: pullRequest.number,
          state: "closed",
        });
        this.log(`Closed PR #${pullRequest.number}`);
      },
      { concurrency: 5 },
    );

    await pMap(
      [...branches],
      async (branch) => {
        try {
          await octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `heads/${branch}`,
          });
        } catch (error) {
          const status =
            error &&
            typeof error === "object" &&
            "status" in error &&
            typeof error.status === "number"
              ? error.status
              : undefined;
          if (status !== 404) {
            throw new Error(`Could not delete remote bookmark ${branch}`, { cause: error });
          }
        }
      },
      { concurrency: 5 },
    );

    await pMap(
      bookmarksToForget,
      async (bookmark) => {
        await $`jj bookmark forget --include-remotes ${bookmark}`;
      },
      { concurrency: 5 },
    );

    this.log(
      `Destroyed stack bookkeeping: closed ${openPullRequests.length} PR(s), deleted ${branches.size} remote branch(es), and forgot ${bookmarksToForget.length} local bookmark(s).`,
    );
    this.log("Revisions were retained; run j sync to create fresh PRs from them.");
  }
}
