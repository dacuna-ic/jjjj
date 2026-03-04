import _ from "lodash";
import { Octokit } from "octokit";
import { $ } from "zx";
import { withCache } from "./cache.js";
import { config } from "./config.js";
import { gh } from "./github-gql.js";
import { graphql } from "./gql/gql.js";
import type { Revision } from "./types.js";

const setPrReadyMutation = graphql(/* GraphQL */ `
  mutation setPrReady($prId: ID!) {
    markPullRequestReadyForReview(input: { pullRequestId: $prId }) {
      pullRequest {
        number
      }
    }
  }
`);

export const markPrReady = async (prNodeId: string) => {
  return gh.mutation(setPrReadyMutation, { prId: prNodeId });
};

export const octokit = new Octokit({
  auth: config.githubToken,
});

export type GithubConstants = {
  owner: string;
  repo: string;
  currentUser: string;
  prefix: string;
  defaultBranch: string;
};

const parseGitRemoteUrl = (url: string): { owner: string; repo: string } => {
  // Handle SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // Handle HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  throw new Error(`Could not parse GitHub remote URL: ${url}`);
};

export const getGhConstants = async (): Promise<GithubConstants> => {
  return withCache("gh-data", async () => {
    // Get remote URL from jj (works in workspaces)
    const remoteOutput = (await $`jj git remote list`.quiet()).stdout.trim();
    const originLine = remoteOutput.split("\n").find((line) => line.startsWith("origin "));
    if (!originLine) {
      throw new Error("Could not find origin remote");
    }
    const remoteUrl = originLine.replace(/^origin\s+/, "");
    const { owner, repo } = parseGitRemoteUrl(remoteUrl);

    const [repoData, currentUser] = await Promise.all([
      octokit.rest.repos.get({ owner, repo }),
      octokit.rest.users.getAuthenticated().then((r) => r.data.login),
    ]);

    return {
      owner,
      repo,
      currentUser,
      prefix: `${currentUser}/`,
      defaultBranch: repoData.data.default_branch,
    };
  });
};

export const getPRByBranchName = async (branchName: string) => {
  const { owner, repo } = await getGhConstants();
  const { data: prs } = await octokit.rest.pulls.list({
    owner,
    repo,
    head: `${owner}:${branchName}`,
    per_page: 1,
    state: "all",
  });

  return prs.at(0);
};

export const getBranchName = async (rev: Revision) => {
  const { prefix } = await getGhConstants();
  if (rev.bookmark) return rev.bookmark;

  if (!rev.description) {
    return undefined;
  }

  // Skip revisions starting with "wip" (treated as checkpoints)
  if (rev.description.toLowerCase().startsWith("wip")) {
    return undefined;
  }

  const parts = rev.description.split(":");
  // Skip revisions without conventional commit format (treated as checkpoints)
  if (parts.length < 2 || !parts[1]?.trim()) {
    return undefined;
  }

  const desc = _.kebabCase(parts[1].trim());

  return `${prefix}${rev.changeId.slice(0, 5)}/${desc}`;
};
