import type { Endpoints } from "@octokit/types";

export type PullRequest = Endpoints["GET /repos/{owner}/{repo}/pulls"]["response"]["data"][number];

export type Revision = {
  changeId: string;
  shortChangeId: string;
  description: string;
  bookmark?: string;
  remoteOutdated: boolean;
};
