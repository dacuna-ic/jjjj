import "zx/globals";
import pMapSeries from "p-map-series";
import { $ } from "zx";
import {
  getBranchName,
  getGhConstants,
  getNativeStackByPRNumber,
  getPRByBranchName,
  octokit,
} from "../lib/github.js";
import type { NativeStack } from "../lib/github.js";
import { abandon, getGitRoot, getRevisions } from "../lib/jj.js";
import { createLogger } from "../lib/logger.js";
import type { PullRequest, Revision } from "../lib/types.js";
import { PRState, emitStackEvent } from "../lib/useStackEvents.js";

$.quiet = true;
const log = createLogger("sync");
const removeClosedRevision = async (
  rev: Revision,
  existingPr: PullRequest | undefined,
  abandonMerged: boolean,
) => {
  if (existingPr?.state !== "closed") return existingPr ?? null;

  if (!existingPr.merged_at) {
    const { owner, repo } = await getGhConstants();
    await octokit.rest.git
      .deleteRef({
        owner,
        repo,
        ref: `heads/${rev.bookmark}`,
      })
      .catch((error) => {
        log.warn({ error, bookmark: rev.bookmark }, "Could not delete remote bookmark");
      });
  }
  await abandon(rev.changeId, !abandonMerged);
  emitStackEvent("update", { rev, state: PRState.DELETED });

  return undefined;
};

const syncSingleRevision = async (rev: Revision) => {
  const existingPr = await getPRByBranchName(rev.bookmark!);
  const { owner, repo, defaultBranch } = await getGhConstants();
  emitStackEvent("update", { rev, state: PRState.SYNCING, prNumber: existingPr?.number });
  await $`jj git push -b ${rev.bookmark}`;

  if (existingPr) {
    if (existingPr.title !== rev.description) {
      await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: existingPr.number,
        title: rev.description,
      });
    }
    emitStackEvent("update", {
      rev,
      state: rev.remoteOutdated ? PRState.UPDATED : PRState.SKIPPED,
      prNumber: existingPr.number,
    });
    return;
  }

  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    title: rev.description,
    body: "",
    head: rev.bookmark!,
    base: defaultBranch,
    draft: true,
  });
  emitStackEvent("update", { rev, state: PRState.CREATED, prNumber: pr.data.number });
};

const linkStack = async (revs: Revision[], abandonMerged: boolean) => {
  const existingPrBookmarks = new Set<string>();
  const pullRequestsByBookmark = new Map<string, PullRequest>();
  const activeRevs: Revision[] = [];
  let nativeStack: NativeStack | undefined;
  let mergedRevisionFound = false;

  for (const rev of revs) {
    const existingPr = await getPRByBranchName(rev.bookmark!);
    if (!existingPr) continue;
    pullRequestsByBookmark.set(rev.bookmark!, existingPr);

    const candidate = await getNativeStackByPRNumber(existingPr.number);
    if (!candidate?.open) continue;
    if (nativeStack && candidate.number !== nativeStack.number) {
      throw new Error(
        `PR #${existingPr.number} belongs to GitHub stack #${candidate.number}, not #${nativeStack.number}`,
      );
    }
    nativeStack = candidate;
  }

  await $`jj git fetch`;

  for (const rev of revs) {
    const existingPr = pullRequestsByBookmark.get(rev.bookmark!);
    if (existingPr?.merged_at) mergedRevisionFound = true;
    const remainingPr = await removeClosedRevision(rev, existingPr, abandonMerged);
    if (remainingPr === undefined) continue;
    if (remainingPr !== null) existingPrBookmarks.add(rev.bookmark!);
    activeRevs.push(rev);
    emitStackEvent("update", {
      rev,
      state: PRState.SYNCING,
      prNumber: remainingPr?.number,
    });
  }

  if (activeRevs.length === 0) return;
  if (activeRevs.length === 1 && !nativeStack) {
    await syncSingleRevision(activeRevs[0]);
    return;
  }

  if (mergedRevisionFound) {
    await $`jj rebase -s ${activeRevs[0].changeId} -d "trunk()"`;
  }

  await pMapSeries(activeRevs, async (rev) => {
    await $`jj git push -b ${rev.bookmark}`;
  });

  const { defaultBranch, owner, repo } = await getGhConstants();
  const nativeBranches = new Set(
    nativeStack?.pull_requests.map((pullRequest) => pullRequest.head.ref) ?? [],
  );
  const stackBase = nativeStack?.base.ref ?? defaultBranch;
  const newBranches = activeRevs
    .filter((rev) => !nativeBranches.has(rev.bookmark!))
    .map((rev) => rev.bookmark!);
  const linkArgs = nativeStack
    ? [String(nativeStack.number), ...newBranches]
    : activeRevs.map((rev) => rev.bookmark!);
  if (!nativeStack || newBranches.length > 0) {
    const gitRoot = await getGitRoot();
    await $({ cwd: gitRoot })`gh stack link --base ${stackBase} ${linkArgs}`;
  }
  await $`jj git fetch`;

  const pullRequestsByActiveBookmark = new Map<string, PullRequest>();
  await pMapSeries(activeRevs, async (rev) => {
    await $`jj bookmark track ${rev.bookmark}@origin`;
    const pr = await getPRByBranchName(rev.bookmark!);
    if (!pr) throw new Error(`gh stack link did not create a pull request for ${rev.bookmark}`);

    if (pr.title !== rev.description) {
      await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: pr.number,
        title: rev.description,
      });
    }

    pullRequestsByActiveBookmark.set(rev.bookmark!, pr);
  });

  // Branch arguments create missing PRs. Re-link with the complete ordered PR
  // list so the native stack update is deterministic and preserves old layers.
  if (!nativeStack || newBranches.length > 0) {
    const resolvedLinkArgs = nativeStack
      ? [
          ...nativeStack.pull_requests.map((pullRequest) => String(pullRequest.number)),
          ...newBranches.map((branch) => String(pullRequestsByActiveBookmark.get(branch)!.number)),
        ]
      : activeRevs.map((rev) => String(pullRequestsByActiveBookmark.get(rev.bookmark!)!.number));
    const gitRoot = await getGitRoot();
    await $({ cwd: gitRoot })`gh stack link --base ${stackBase} ${resolvedLinkArgs}`;
  }

  await pMapSeries(activeRevs, async (rev) => {
    const pr = pullRequestsByActiveBookmark.get(rev.bookmark!)!;
    emitStackEvent("update", {
      rev,
      state: existingPrBookmarks.has(rev.bookmark!)
        ? rev.remoteOutdated
          ? PRState.UPDATED
          : PRState.SKIPPED
        : PRState.CREATED,
      prNumber: pr.number,
    });
  });
};

export const syncRevisions = async (revisions?: string, abandonMerged = false) => {
  const revs = await getRevisions(revisions);
  emitStackEvent("init", revs);

  const stackRevs: Revision[] = [];
  await pMapSeries(revs, async (rev) => {
    rev.bookmark = await getBranchName(rev);
    if (!rev.bookmark) {
      emitStackEvent("update", { rev, state: PRState.SKIPPED });
      return;
    }

    await $`jj bookmark set -r ${rev.changeId} ${rev.bookmark} --allow-backwards`;
    stackRevs.push(rev);
  });

  await linkStack(stackRevs, abandonMerged);
};
