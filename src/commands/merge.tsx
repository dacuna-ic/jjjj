import { Command, Flags } from "@oclif/core";
import { Box, render, useInput } from "ink";
import { Text } from "ink";
import Spinner from "ink-spinner";
// biome-ignore lint/style/useImportType: react needs to be imported
import React, { useEffect, useState } from "react";
import { RevisionDisplay } from "../components/RevisionState.js";
import { StatusState } from "../lib/gql/graphql.js";
import { getRevisions } from "../lib/jj.js";
import {
	MergeState,
	type RevisionToMerge,
	StackMerge,
	useMergeEvent,
} from "../services/merge.js";

const statusCharacterMap: Record<string, React.ReactNode> = {
	[MergeState.INIT]: <Text color="gray">○</Text>,
	[MergeState.MERGED]: <Text color="magenta">●</Text>,
	default: (
		<Text color="gray">
			<Spinner type="circleHalves" />
		</Text>
	),
};

const labelMap: Record<MergeState, string> = {
	[MergeState.INIT]: "Pending",
	[MergeState.MERGED]: "Merged",
	[MergeState.PROCESSING]: "Processing",
	[MergeState.SYNCING]: "Syncing",
	[MergeState.WAITING_FOR_MERGEABILITY]: "Waiting for mergeability",
	[MergeState.WAITING_FOR_CONFIRMATION]: "Waiting for confirmation",
	[MergeState.MERGING]: "Merging",
	[MergeState.SKIPPED]: "Skipped",
};

// Confirmation dialog component for outdated revisions
const OutdatedRevisionsConfirmation = ({
	revisions,
	onConfirm,
	onCancel,
}: {
	revisions: RevisionToMerge[];
	onConfirm: () => void;
	onCancel: () => void;
}) => {
	const [selected, setSelected] = useState<"yes" | "no">("no");

	useInput((input, key) => {
		if (input === "y") {
			setSelected("yes");
		} else if (input === "n") {
			setSelected("no");
		} else if (key.return) {
			if (selected === "yes") {
				onConfirm();
			} else {
				onCancel();
			}
		}
	});

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="yellow"
			padding={1}
		>
			<Text bold color="yellow">
				Warning: Outdated Revisions
			</Text>
			<Text>The following revisions are outdated:</Text>
			<Box marginLeft={2} flexDirection="column">
				{revisions.map((rev) => (
					<Text key={rev.rev.changeId}>
						• {rev.rev.description} ({rev.rev.shortChangeId})
					</Text>
				))}
			</Box>
			<Text>Do you want to continue with the merge process?</Text>
			<Box marginTop={1} flexDirection="row" gap={2}>
				<Text color={selected === "yes" ? "green" : "gray"}>
					{selected === "yes" ? ">" : " "} [Y]es
				</Text>
				<Text color={selected === "no" ? "red" : "gray"}>
					{selected === "no" ? ">" : " "} [N]o
				</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor italic>
					Press Y/N and Enter to confirm
				</Text>
			</Box>
		</Box>
	);
};

const MergeRevisionDisplay = ({
	revToMerge,
}: {
	revToMerge: RevisionToMerge;
}) => {
	const [state, setState] = useState<MergeState>(MergeState.INIT);
	const [reasons, setReasons] = useState<{
		mergeable: boolean;
		approved: boolean;
		statusChecks: StatusState | null;
	} | null>(null);

	useMergeEvent("update", (evt) => {
		if (evt.rev !== revToMerge) return;
		if (evt.state === MergeState.WAITING_FOR_MERGEABILITY) {
			setReasons(evt.reasons);
		}

		setState(evt.state);
	});

	return (
		<RevisionDisplay
			rev={revToMerge.rev}
			label={labelMap[state]}
			statusCharacter={statusCharacterMap[state] || statusCharacterMap.default}
			description={
				state === MergeState.WAITING_FOR_MERGEABILITY && (
					<Text>
						<Text color={reasons?.mergeable ? "green" : "red"}>
							{reasons?.mergeable ? "✓" : "×"} Mergeable
						</Text>
						<Text> | </Text>
						<Text color={reasons?.approved ? "green" : "red"}>
							{reasons?.approved ? "✓" : "×"} Approved
						</Text>
						<Text> | </Text>
						<Text
							color={
								{
									[StatusState.Success]: "green",
									[StatusState.Pending]: "yellow",
									[StatusState.Expected]: "yellow",
									[StatusState.Failure]: "red",
									[StatusState.Error]: "red",
									default: "gray",
								}[reasons?.statusChecks ?? "default"]
							}
						>
							{
								{
									[StatusState.Success]: "✓",
									[StatusState.Pending]: <Spinner type="dots" />,
									[StatusState.Expected]: <Spinner type="dots" />,
									[StatusState.Failure]: "×",
									[StatusState.Error]: "×",
									default: "",
								}[reasons?.statusChecks ?? "default"]
							}{" "}
							Status Checks
						</Text>
					</Text>
				)
			}
		/>
	);
};

const App = ({ revisions }: { revisions: string }) => {
	const [revisionsToMerge, setRevisionsToMerge] = useState<RevisionToMerge[]>(
		[],
	);
	const [outdatedRevisions, setOutdatedRevisions] = useState<RevisionToMerge[]>(
		[],
	);
	const [showConfirmation, setShowConfirmation] = useState(false);
	const [merge, setMerge] = useState<StackMerge | null>(null);

	useEffect(() => {
		const initMerge = async () => {
			const revs = await getRevisions(revisions);
			const stackMerge = new StackMerge(revs);
			setMerge(stackMerge);

			stackMerge.execute().catch((err) => {
				console.error(err);
				process.exit(1);
			});
		};

		initMerge();
	}, [revisions]);

	useMergeEvent("init", (revs) => {
		setRevisionsToMerge([...revs].reverse());
	});

	useMergeEvent("update", ({ rev, state }) => {
		setRevisionsToMerge((prev) => {
			const index = prev.findIndex((r) => r.rev.changeId === rev.rev.changeId);

			if (index !== -1) prev[index] = rev;

			return prev;
		});
	});

	useMergeEvent("outdatedRevisions", ({ revisions, confirmed }) => {
		if (!confirmed) {
			setOutdatedRevisions(revisions);
			setShowConfirmation(true);
		}
	});

	const handleConfirmOutdated = () => {
		if (merge) {
			merge.confirmOutdatedRevisions = true;
		}
		setShowConfirmation(false);
	};

	const handleCancelOutdated = () => {
		setShowConfirmation(false);
		process.exit(0);
	};

	useInput((input) => {
		if (input === "q") {
			process.exit(0);
		}
	});

	if (showConfirmation) {
		return (
			<OutdatedRevisionsConfirmation
				revisions={outdatedRevisions}
				onConfirm={handleConfirmOutdated}
				onCancel={handleCancelOutdated}
			/>
		);
	}

	if (revisionsToMerge.length === 0) {
		return (
			<Box flexDirection="row" gap={1}>
				<Spinner type="circleHalves" />
				<Text>Loading revision data...</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			{revisionsToMerge.map((revToMerge) => (
				<MergeRevisionDisplay
					key={revToMerge.rev.changeId}
					revToMerge={revToMerge}
				/>
			))}
			<Text>~</Text>
		</Box>
	);
};

export default class Merge extends Command {
	static override description = "Merge revisions in the stack";

	static override examples = [
		"<%= config.bin %> <%= command.id %>",
		'<%= config.bin %> <%= command.id %> --revisions "fork_point(trunk()..@)::@"',
	];

	static override flags = {
		revisions: Flags.string({
			char: "r",
			description: "revision set to merge",
			default: "fork_point(trunk()..@)::@",
		}),
	};

	public async run(): Promise<void> {
		const { flags } = await this.parse(Merge);

		const r = render(<App revisions={flags.revisions} />);

		process.on("SIGINT", () => {
			r.unmount();
			process.exit(0);
		});
	}
}
