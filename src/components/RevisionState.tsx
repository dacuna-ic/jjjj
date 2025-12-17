import type { ColorName } from "chalk";
import { Text } from "ink";
import React from "react";
import type { Revision } from "../lib/types.js";

export const RevisionDisplay = ({
	rev,
	label,
	color = "gray",
	bgColor,
	statusCharacter = "○",
	description,
}: {
	rev: Revision;
	label: React.ReactNode;
	color?: ColorName;
	bgColor?: ColorName;
	statusCharacter: React.ReactNode;
	description?: React.ReactNode;
}) => {
	const coloredChangeId = React.useMemo(() => {
		const maxChars = 6;
		const withoutShortest = rev.changeId.replace(rev.shortChangeId, "");

		return (
			<Text bold>
				<Text color="magenta">{rev.shortChangeId}</Text>
				<Text color="gray">
					{withoutShortest.slice(0, maxChars - rev.shortChangeId.length)}
				</Text>
			</Text>
		);
	}, [rev.changeId, rev.shortChangeId]);

	return (
		<React.Fragment>
			<Text>
				<Text color={color}>{statusCharacter}</Text> {coloredChangeId}{" "}
				<Text color={color} bold>
					{rev.bookmark || "N/A"}
				</Text>{" "}
			</Text>

			<Text>
				<Text>│ </Text>
				<Text color="white" dimColor>
					<Text>{label}</Text>
					{description && <Text> - {description}</Text>}
				</Text>
			</Text>
		</React.Fragment>
	);
};
