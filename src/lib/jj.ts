import { confirm } from "@inquirer/prompts";
import { $ } from "zx";
import type { Revision } from "./types.js";

export const fetch = async () => {
	await $`jj git fetch`;
};

export const abandon = async (rev?: string, withConfirmation = true) => {
	if (!rev) return false;

	if (withConfirmation) {
		const confirmed = await confirm({
			message: `Are you sure you want to abandon ${rev}?`,
			default: true,
		});

		if (!confirmed) return false;
	}

	await $`jj abandon ${rev}`;
	return true;
};

type TemplateField = {
	name: string;
	as?: string;
	transform?: (value: string) => unknown;
};

export const buildTemplate = (fields: TemplateField[]) => {
	const separator = "~~SEPARATOR~~";
	const template = `concat(${[...fields.map((field) => field.name), `"${separator}"`].join(", '~', ")})`;

	return [
		template,
		(result: string) => {
			return result
				.replace(new RegExp(`${separator}\$`, "g"), "")
				.split(separator)
				.map((line) => {
					const values = line.split("~");

					return fields.reduce<Record<string, unknown>>((acc, field, index) => {
						acc[field.as || field.name] = field.transform
							? field.transform(values[index])
							: values[index];
						return acc;
					}, {});
				});
		},
	] as const;
};

export const log = ({
	revisions,
	reversed,
	fields,
}: {
	revisions: string;
	reversed?: boolean;
	fields: TemplateField[];
}) => {
	const [template, parse] = buildTemplate(fields);

	return $`jj log --quiet -r ${revisions} ${reversed ? ["--reversed"] : []} --template=${template} --no-graph`
		.text()
		.then((text) => {
			return parse(text);
		});
};

export const templateGetAllRevisionsOf = (rev: string) => {
	return `fork_point(trunk()..${rev})::descendants(${rev})`;
};

export const getRevisions = async (query = templateGetAllRevisionsOf("@")) => {
	const result = await log({
		revisions: query,
		reversed: true,
		fields: [
			{ name: "change_id", as: "changeId" },
			{ name: "change_id.shortest()", as: "shortChangeId" },
			{ name: "description.first_line()", as: "description" },
			{
				name: 'bookmarks.join(",")',
				as: "bookmark",
				transform: (value) => value.replace("*", "").split(",").at(0),
			},
			{
				name: 'bookmarks.join(",")',
				as: "remoteOutdated",
				transform: (value) => value.split(",").at(0)?.includes("*"),
			},
		],
	});

	return result as Revision[];
};

export const getBookmarks = async () => {
	const items = await log({
		revisions: "fork_point(trunk()..@)::",
		fields: [
			{
				name: "bookmarks",
				as: "bookmarks",
				transform: (value) =>
					value
						.split(",")
						.map((bookmark) => bookmark.trim().replaceAll(/\*|\?/g, "")),
			},
		],
	});

	return items.map((item) =>
		(item.bookmarks as string[]).filter(Boolean).at(0),
	);
};

export const getStatus = async () => {
	const status = (await $`jj status`.text()).split("\n").slice(1);

	const changes = [];
	for (const line of status) {
		if (line.startsWith("Working copy")) break;

		const [type, path] = line.split(" ");

		changes.push({ type, path });
	}

	return changes;
};
