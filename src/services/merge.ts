import pMap from "p-map";
import pWaitFor from "p-wait-for";
import { $, chalk } from "zx";
import { gh } from "../lib/github-gql.js";
import { getGhConstants, getPRByBranchName, markPrReady, octokit } from "../lib/github.js";
import {
  type GetPrMergeDataQuery,
  MergeableState,
  PullRequestReviewDecision,
  StatusState,
} from "../lib/gql/graphql.js";
import { graphql } from "../lib/gql/index.js";
import { getRevisions, templateGetAllRevisionsOf } from "../lib/jj.js";
import { createLogger } from "../lib/logger.js";
import type { PullRequest, Revision } from "../lib/types.js";
import { createEventHook } from "../lib/useEvent.js";

// Create a logger for this module
const log = createLogger("merge");

// Define the event hook types
type MergeEventTypes = {
  init: RevisionToMerge[];
  update:
    | {
        rev: RevisionToMerge;
        state: Exclude<MergeState, MergeState.WAITING_FOR_MERGEABILITY>;
      }
    | {
        rev: RevisionToMerge;
        state: MergeState.WAITING_FOR_MERGEABILITY;
        reasons: {
          mergeable: boolean;
          approved: boolean;
          statusChecks: StatusState | null;
        };
      };
  outdatedRevisions: {
    revisions: RevisionToMerge[];
    confirmed: boolean;
  };
};

export const [emitMergeEvent, useMergeEvent] = createEventHook<MergeEventTypes>();

// Log emitted merge events
const logEvents = <K extends keyof MergeEventTypes>(type: K, data: MergeEventTypes[K]) => {
  log.debug(`Emitting merge event: ${type}`, { type, data });
  return emitMergeEvent(type, data);
};

const getPrMergeData = graphql(/* GraphQL */ `
  query getPrMergeData($owner: String!, $repo: String!, $prNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        reviewDecision
        mergeable
        canBeRebased
        statusCheckRollup {
          state
        }
      }
    }
  }
`);

log.debug("Initialized merge module");

type MergeData = NonNullable<GetPrMergeDataQuery["repository"]>["pullRequest"];

export enum MergeState {
  INIT = "init",
  PROCESSING = "processing",
  SYNCING = "syncing",
  WAITING_FOR_MERGEABILITY = "waiting_for_mergeability",
  WAITING_FOR_CONFIRMATION = "waiting_for_confirmation",
  MERGING = "merging",
  MERGED = "merged",
  SKIPPED = "skipped",
}

export class RevisionToMerge {
  rev: Revision;
  _pr?: PullRequest;
  _mergeData?: MergeData;

  constructor(rev: Revision) {
    this.rev = rev;
    log.debug(`Created RevisionToMerge for revision: ${rev.changeId}`);
  }

  get pr() {
    if (!this._pr) {
      throw new Error("Must call getPr first");
    }

    return this._pr!;
  }

  get mergeData() {
    if (!this._mergeData) {
      throw new Error("Must call getPr first");
    }

    return this._mergeData!;
  }

  async waitForMergeability() {
    log.info(`Waiting for mergeability of revision: ${this.rev.changeId}`);
    return pWaitFor(
      async () => {
        if (await this.canBeMerged()) {
          log.debug(`Revision is now mergeable: ${this.rev.changeId}`);
          return true;
        }

        log.debug(`Revision still not mergeable: ${this.rev.changeId}, updating...`);
        await this.update(false);
        return false;
      },
      { interval: 3000 },
    );
  }

  async canBeMerged() {
    let canBeMerged = true;
    if (!this.rev.bookmark) {
      log.debug(`Revision has no bookmark, cannot be merged: ${this.rev.changeId}`);
      return false;
    }

    const reasons: {
      mergeable: boolean;
      approved: boolean;
      statusChecks: StatusState | null;
    } = { mergeable: true, approved: true, statusChecks: null };

    const statusCheckState = this.mergeData.statusCheckRollup?.state;
    if (
      statusCheckState &&
      [StatusState.Failure, StatusState.Pending, StatusState.Error, StatusState.Expected].includes(
        statusCheckState,
      )
    ) {
      log.debug(
        `Status checks not passing: ${statusCheckState} for revision: ${this.rev.changeId}`,
      );
      reasons.statusChecks = statusCheckState;
      canBeMerged = false;
    }

    if (this.mergeData.mergeable !== MergeableState.Mergeable) {
      log.debug(
        `Revision not mergeable: ${this.mergeData.mergeable} for revision: ${this.rev.changeId}`,
      );
      reasons.mergeable = false;
      canBeMerged = false;
    }

    if (
      ![PullRequestReviewDecision.Approved, null, undefined].includes(this.mergeData.reviewDecision)
    ) {
      log.debug(
        `PR not approved: ${this.mergeData.reviewDecision} for revision: ${this.rev.changeId}`,
      );
      reasons.approved = false;
      canBeMerged = false;
    }

    logEvents("update", {
      rev: this,
      state: MergeState.WAITING_FOR_MERGEABILITY,
      reasons,
    });
    return canBeMerged;
  }

  async waitForMerge() {
    const { owner, repo } = await getGhConstants();
    log.info(`Waiting for merge of PR #${this.pr.number}`);
    return pWaitFor(
      async () =>
        octokit.rest.pulls
          .checkIfMerged({
            owner,
            repo,
            pull_number: this.pr.number,
          })
          .then(() => {
            log.debug(`PR #${this.pr.number} is merged`);
            return true;
          })
          .catch(() => {
            log.debug(`PR #${this.pr.number} is not yet merged`);
            return false;
          }),
      { interval: 1000 },
    );
  }

  isEligible() {
    const eligible = !!this.rev.bookmark;
    log.debug(`Checking if revision is eligible: ${this.rev.changeId}`, {
      eligible,
    });
    return eligible;
  }

  async update(emitEvent = true) {
    if (!this.isEligible()) {
      log.debug(`Skipping update for ineligible revision: ${this.rev.changeId}`);
      return;
    }

    if (emitEvent) {
      log.debug(`Updating revision: ${this.rev.changeId}`);
      logEvents("update", { rev: this, state: MergeState.SYNCING });
    }

    const pr = await getPRByBranchName(this.rev.bookmark!);

    if (!pr) {
      const error = `PR not found for rev: ${this.rev.changeId}`;
      log.error(error);
      throw new Error(error);
    }

    const { owner, repo } = await getGhConstants();

    log.debug(`Found PR #${pr.number} for revision: ${this.rev.changeId}`);
    const { data: mergeDataResult, error } = await gh.query(getPrMergeData, {
      owner,
      repo,
      prNumber: pr.number,
    });

    if (error) {
      const errorMsg = `Error getting merge data for PR #${pr.number}: ${error}`;
      log.error(errorMsg);
      throw new Error(errorMsg);
    }

    this._pr = pr;
    this._mergeData = mergeDataResult?.repository?.pullRequest;
    this.rev = (await getRevisions(this.rev.changeId)).at(0)!;
    log.debug(`Updated revision data: ${this.rev.changeId}`, {
      prNumber: this._pr?.number,
      mergeable: this._mergeData?.mergeable,
    });
  }

  async merge() {
    const { owner, repo } = await getGhConstants();

    log.info(`Starting merge process for revision: ${this.rev.changeId}`);
    await this.waitForMergeability();

    log.info(`Merging PR #${this.pr.number}`);
    logEvents("update", { rev: this, state: MergeState.MERGING });
    await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: this.pr.number,
      merge_method: "squash",
    });

    log.debug(`Waiting for merge to complete for PR #${this.pr.number}`);
    await this.waitForMerge();
    log.info(`PR #${this.pr.number} successfully merged`);
    logEvents("update", { rev: this, state: MergeState.MERGED });
  }
}

export type StackMergeOptions = {
  autoReady?: boolean;
};

export class StackMerge {
  revs: Revision[] = [];
  mergeRevisions: RevisionToMerge[] = [];
  hasOutdatedRevisions = false;
  confirmOutdatedRevisions = false;
  options: StackMergeOptions;

  constructor(revs: Revision[], options: StackMergeOptions = {}) {
    this.revs = revs;
    this.options = options;
    log.info(`Created StackMerge with ${revs.length} revisions`, { options });
  }

  async buildMergeRevisions() {
    log.debug("Building merge revisions");
    this.mergeRevisions = await pMap(
      this.revs,
      async (rev) => {
        log.debug(`Processing revision: ${rev.changeId}`);
        const mergeRevision = new RevisionToMerge(rev);
        await mergeRevision.update();
        return mergeRevision;
      },
      { concurrency: 5 },
    );
    log.info(`Built ${this.mergeRevisions.length} merge revisions`);
    logEvents("init", this.mergeRevisions);
  }

  async execute() {
    log.info("Starting StackMerge execution");
    await this.buildMergeRevisions();

    // Check if any revisions are outdated
    const outdatedRevisions = this.mergeRevisions.filter((rev) => rev.rev.remoteOutdated);
    if (outdatedRevisions.length > 0) {
      log.warn(`Found ${outdatedRevisions.length} outdated revisions`);
      this.hasOutdatedRevisions = true;

      // Emit event to notify UI about outdated revisions
      logEvents("outdatedRevisions", {
        revisions: outdatedRevisions,
        confirmed: false,
      });

      // Wait for confirmation from UI
      log.info("Waiting for confirmation to proceed with outdated revisions");
      await pWaitFor(() => this.confirmOutdatedRevisions, { interval: 500 });
      log.info("Received confirmation to proceed with outdated revisions");
    }

    for await (const mergeRev of this.mergeRevisions) {
      log.info(`Processing revision for merge: ${mergeRev.rev.changeId}`);
      logEvents("update", {
        rev: mergeRev,
        state: MergeState.PROCESSING,
      });

      if (!mergeRev.isEligible()) {
        log.warn(`Skipping ineligible revision: ${mergeRev.rev.changeId}`);
        logEvents("update", {
          rev: mergeRev,
          state: MergeState.SKIPPED,
        });
        continue;
      }
      // Not sure if this is needed or not...
      log.debug("Waiting 3 seconds before proceeding...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      log.debug(`Updating revision: ${mergeRev.rev.changeId}`);
      await mergeRev.update();

      // Mark PR as ready if auto-ready is enabled
      if (this.options.autoReady) {
        log.info(`Marking PR #${mergeRev.pr.number} as ready for review`);
        await markPrReady(mergeRev.pr.node_id);
      }

      log.info(`Merging revision: ${mergeRev.rev.changeId}`);
      await mergeRev.merge();
      log.debug("Running restack command");
      await $`j restack`;

      // End here if this is the last revision to merge
      if (mergeRev === this.mergeRevisions.at(-1)) {
        log.debug("Reached last revision in stack, stopping loop");
        break;
      }

      const r = templateGetAllRevisionsOf(this.revs.at(-1)?.changeId!);
      log.debug(`Syncing remaining revisions with template: ${r}`);
      await $`j sync -r ${r} -y`;
    }

    log.info(`${this.mergeRevisions.length} merges completed!`);
    console.log(chalk.green(`${this.mergeRevisions.length} merges completed!`));
    process.exit(0);
  }
}
