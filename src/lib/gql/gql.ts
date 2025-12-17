import type { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";
/* eslint-disable */
import * as types from "./graphql.js";

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
	"\n  mutation setPrReady($prId: ID!) {\n    markPullRequestReadyForReview(input: { pullRequestId: $prId }) {\n      pullRequest {\n        number\n      }\n    }\n  }\n": typeof types.SetPrReadyDocument;
	"\n  query getPrMergeData($owner: String!, $repo: String!, $prNumber: Int!) {\n    repository(owner: $owner, name: $repo) {\n      pullRequest(number: $prNumber) {\n        reviewDecision\n        mergeable\n        canBeRebased\n        statusCheckRollup {\n          state\n        }\n      }\n    }\n  }\n": typeof types.GetPrMergeDataDocument;
};
const documents: Documents = {
	"\n  mutation setPrReady($prId: ID!) {\n    markPullRequestReadyForReview(input: { pullRequestId: $prId }) {\n      pullRequest {\n        number\n      }\n    }\n  }\n":
		types.SetPrReadyDocument,
	"\n  query getPrMergeData($owner: String!, $repo: String!, $prNumber: Int!) {\n    repository(owner: $owner, name: $repo) {\n      pullRequest(number: $prNumber) {\n        reviewDecision\n        mergeable\n        canBeRebased\n        statusCheckRollup {\n          state\n        }\n      }\n    }\n  }\n":
		types.GetPrMergeDataDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
	source: "\n  mutation setPrReady($prId: ID!) {\n    markPullRequestReadyForReview(input: { pullRequestId: $prId }) {\n      pullRequest {\n        number\n      }\n    }\n  }\n",
): (typeof documents)["\n  mutation setPrReady($prId: ID!) {\n    markPullRequestReadyForReview(input: { pullRequestId: $prId }) {\n      pullRequest {\n        number\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
	source: "\n  query getPrMergeData($owner: String!, $repo: String!, $prNumber: Int!) {\n    repository(owner: $owner, name: $repo) {\n      pullRequest(number: $prNumber) {\n        reviewDecision\n        mergeable\n        canBeRebased\n        statusCheckRollup {\n          state\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query getPrMergeData($owner: String!, $repo: String!, $prNumber: Int!) {\n    repository(owner: $owner, name: $repo) {\n      pullRequest(number: $prNumber) {\n        reviewDecision\n        mergeable\n        canBeRebased\n        statusCheckRollup {\n          state\n        }\n      }\n    }\n  }\n"];

export function graphql(source: string) {
	return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
	TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
