import { Client, fetchExchange } from "@urql/core";
import { config } from "./config.js";

export const gh = new Client({
	url: "https://api.github.com/graphql",
	fetchOptions: {
		headers: {
			Authorization: `Bearer ${config.githubToken}`,
		},
	},
	exchanges: [fetchExchange],
});
