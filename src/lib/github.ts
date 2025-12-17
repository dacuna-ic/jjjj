import _ from "lodash";
import { Octokit } from "octokit";
import { $ } from "zx";
import { withCache } from "./cache.js";
import { config } from "./config.js";
import type { Revision } from "./types.js";

export const octokit = new Octokit({
  auth: config.githubToken,
});

export type GithubConstants = {
  owner: string;
  repo: string;
  currentUser: string;
  prefix: string;
};

export const getGhConstants = async (): Promise<GithubConstants> => {
  return withCache("gh-data", async () => {
    const [repoData, currentUser] = await Promise.all([
      $`gh repo view --json owner,name`.json() as Promise<{
        owner: { login: string };
        name: string;
      }>,
      octokit.rest.users.getAuthenticated().then((r) => r.data.login),
    ]);

    return {
      owner: repoData.owner.login,
      repo: repoData.name,
      currentUser,
      prefix: `${currentUser}/`,
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

  const desc = _.kebabCase(
    rev.description.split(":").at(1)?.trim() ?? rev.description,
  );

  return `${prefix}${rev.changeId.slice(0, 5)}/${desc}`;
};
