import "zx/globals";
import _ from "lodash";
import pMap from "p-map";
import pMapSeries from "p-map-series";
import pRetry from "p-retry";
import { $ } from "zx";
import {
  getBranchName,
  getGhConstants,
  getPRByBranchName,
  octokit,
} from "../lib/github.js";
import { abandon, getRevisions, log } from "../lib/jj.js";
import type { Revision } from "../lib/types.js";
import { PRState, emitStackEvent } from "../lib/useStackEvents.js";

$.quiet = true;
let supportsDraftPrs = true;

const upsertStackComment = async (
  prNumber: number,
  commentContents: string[],
) => {
  const { owner, repo } = await getGhConstants();
  const commentRef = "jjjj-ref";
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    direction: "asc",
    per_page: 100,
  });

  const existingComment = comments.find((c) =>
    c.body?.includes(`<div id="${commentRef}">`),
  );

  const prsInStack = commentContents.filter(Boolean).length;

  // Single PR stack: delete existing comment if any, don't create new one
  if (prsInStack <= 1) {
    if (existingComment) {
      await octokit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: existingComment.id,
      });
    }
    return;
  }

  const newBody = [
    `<div id="${commentRef}">\n`,
    "#### Note: this is a stack of PRs, check the following for more details:",
    [...commentContents].reverse().join("\n"),
    "\n</div>",
  ].join("\n");

  if (existingComment) {
    // If the comment is the same, don't update it
    if (existingComment.body === newBody) return;

    return octokit.rest.issues.updateComment({
      owner,
      repo,
      issue_number: prNumber,
      comment_id: existingComment.id,
      body: newBody,
    });
  }

  return octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: newBody,
  });
};

const createOrUpdatePR = async (
  rev: Revision,
  prev: Revision,
  abandonMerged: boolean,
) => {
  const existingPr = await getPRByBranchName(rev.bookmark!);
  const { owner, repo, defaultBranch } = await getGhConstants();

  if (existingPr?.state === "closed") {
    await octokit.rest.git
      .deleteRef({
        owner,
        repo,
        ref: `heads/${rev.bookmark}`,
      })
      .catch((e) => {
        console.log(`Could not delete ${rev.bookmark}: ${e.message}`);
      });
    await abandon(rev.changeId, !abandonMerged);
    emitStackEvent("update", { rev, state: PRState.DELETED });

    return undefined;
  }

  const prExists = !!existingPr;

  const prParams = {
    owner,
    repo,
    title: rev.description,
    body: "",
    head: rev.bookmark!,
    base: prev?.bookmark || defaultBranch,
  };

  if (prExists) {
    const pr = await octokit.rest.pulls.update({
      ...prParams,
      body: undefined,
      pull_number: existingPr.number,
    });

    emitStackEvent("update", {
      rev,
      state: PRState.UPDATED,
      prNumber: pr.data.number,
    });

    return pr.data;
  }
  const pr = await pRetry(
    () =>
      octokit.rest.pulls
        .create({ ...prParams, draft: supportsDraftPrs })
        .catch((err) => {
          if (
            err.status === 422 &&
            err.message.includes("Draft pull requests are not supported")
          ) {
            supportsDraftPrs = false;
          }

          throw err;
        }),
    { retries: 1 },
  );

  emitStackEvent("update", {
    rev,
    state: PRState.CREATED,
    prNumber: pr.data.number,
  });

  return pr.data;
};

export const syncRevisions = async (
  revisions?: string,
  abandonMerged = false,
) => {
  const revs = await getRevisions(revisions);

  emitStackEvent("init", revs);

  await pMapSeries(revs, async (rev, i) => {
    const isNewBookmark = !rev.bookmark;
    rev.bookmark = await getBranchName(rev);

    if (!rev.bookmark) {
      emitStackEvent("update", { rev, state: PRState.SKIPPED });
      return rev;
    }

    if (!isNewBookmark && !rev.remoteOutdated) {
      emitStackEvent("update", { rev, state: PRState.SKIPPED });
      return rev;
    }

    emitStackEvent("update", { rev, state: PRState.SYNCING });

    await $`jj bookmark set -r ${rev.changeId} ${rev.bookmark} --allow-backwards`;
    await $`jj bookmark track ${rev.bookmark}@origin`;
    await $`jj git push -b ${rev.bookmark}`;
  });

  const results = await pMapSeries(revs, async (rev, i) => {
    if (!rev.bookmark) return { rev };
    const prevRev = revs[i - 1];

    emitStackEvent("update", { rev, state: PRState.PENDING });

    const pr = await createOrUpdatePR(rev, prevRev, abandonMerged);

    return { pr, rev };
  });

  await pMap(
    results,
    async ({ pr, rev }) => {
      if (!pr) return;
      const commentContents = results.map((current) => {
        if (!current.pr) return "";
        const isCurrent = current.pr?.number === pr?.number;
        return `${isCurrent ? "●" : "○"} #${current.pr?.number} \`${current.pr.title}\``;
      });

      await upsertStackComment(pr.number, commentContents);
    },
    { concurrency: 10 },
  );
};
