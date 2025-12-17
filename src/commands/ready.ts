import { Command, Flags } from "@oclif/core";
import pMap from "p-map";
import { gh } from "../lib/github-gql.js";
import { getPRByBranchName } from "../lib/github.js";
import { graphql } from "../lib/gql/gql.js";
import { getRevisions } from "../lib/jj.js";

const setPrReady = graphql(/* GraphQL */ `
  mutation setPrReady($prId: ID!) {
    markPullRequestReadyForReview(input: { pullRequestId: $prId }) {
      pullRequest {
        number
      }
    }
  }
`);

export default class Ready extends Command {
	static override description = "Mark pull requests as ready for review";

	static override examples = [
		"<%= config.bin %> <%= command.id %>",
		'<%= config.bin %> <%= command.id %> --revisions "fork_point(trunk()..@)::@"',
	];

	static override flags = {
		revisions: Flags.string({
			char: "r",
			description: "revision set to mark as ready",
			default: "fork_point(trunk()..@)::@",
		}),
	};

	public async run(): Promise<void> {
		const { flags } = await this.parse(Ready);

		const revs = await getRevisions(flags.revisions);

		const results = await pMap(
			revs,
			async (rev) => {
				if (!rev.bookmark) {
					return;
				}

				const pr = await getPRByBranchName(rev.bookmark);

				if (!pr) {
					throw new Error(`PR not found for rev: ${rev.changeId}`);
				}

				return gh.mutation(setPrReady, {
					prId: pr.node_id,
				});
			},
			{ concurrency: 10 },
		);

		this.log(
			`Set PRs ${results.map((r) => r?.data?.markPullRequestReadyForReview?.pullRequest?.number)} to ready`,
		);
	}
}
