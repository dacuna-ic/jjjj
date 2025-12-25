import { Command, Flags } from "@oclif/core";
import { Box, Text, render } from "ink";
import React, { useState, useEffect } from "react";
import { RevisionDisplay } from "../components/RevisionState.js";
import { getGhConstants } from "../lib/github.js";
import type { Revision } from "../lib/types.js";
import { PRState, useStackEvent } from "../lib/useStackEvents.js";
import { syncRevisions } from "../services/sync.js";

type RevisionWithState = { rev: Revision; state: PRState; prNumber?: number };

const getLabel = (state: PRState) => {
  if (state === PRState.PENDING) return "Pending";
  if (state === PRState.CREATED) return "Created";
  if (state === PRState.SKIPPED) return "Skipped";
  if (state === PRState.DELETED) return "Deleted";
  if (state === PRState.UPDATED) return "Updated";
  if (state === PRState.SYNCING) return "Syncing";
  return "Unknown";
};

const getColor = (state: PRState) => {
  if (state === PRState.PENDING) return "gray";
  if (state === PRState.CREATED) return "green";
  if (state === PRState.UPDATED) return "green";
  if (state === PRState.SKIPPED) return "yellow";
  if (state === PRState.DELETED) return "red";
  return "gray";
};

const App = ({
  owner,
  repo,
  revisions,
  abandonMerged,
}: {
  owner: string;
  repo: string;
  revisions?: string;
  abandonMerged: boolean;
}) => {
  const [state, setState] = useState<RevisionWithState[]>([]);
  useEffect(() => {
    syncRevisions(revisions, abandonMerged);
  }, [revisions, abandonMerged]);

  useStackEvent("init", (revs) => {
    setState([...revs].reverse().map((rev) => ({ rev, state: PRState.PENDING })));
  });

  useStackEvent("update", (event: RevisionWithState) => {
    setState((prevState) =>
      prevState.map((item) => (item.rev.changeId === event.rev.changeId ? event : item)),
    );
  });

  const getPrURL = (prNumber: number) => `https://github.com/${owner}/${repo}/pull/${prNumber}`;

  return (
    <Box flexDirection="column">
      {state.map((item) => (
        <RevisionDisplay
          key={item.rev.changeId}
          rev={item.rev}
          label={getLabel(item.state)}
          color={getColor(item.state)}
          statusCharacter={
            item.state === PRState.PENDING || item.state === PRState.SYNCING ? "○" : "●"
          }
          description={
            item.prNumber && (
              <Text>
                <Text color="yellow">#{item.prNumber} </Text>
                <Text>{getPrURL(item.prNumber)}</Text>
              </Text>
            )
          }
        />
      ))}
      <Text>~</Text>
    </Box>
  );
};

export default class Sync extends Command {
  static override description = "Sync revisions with GitHub pull requests";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  static override flags = {
    revisions: Flags.string({
      char: "r",
      description: "Revisions to sync",
    }),
    "abandon-merged": Flags.boolean({
      char: "y",
      description: "Abandon merged revisions",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Sync);
    const { owner, repo } = await getGhConstants();
    const r = render(
      <App
        owner={owner}
        repo={repo}
        revisions={flags.revisions}
        abandonMerged={flags["abandon-merged"]}
      />,
    );

    process.on("SIGINT", () => {
      r.unmount();
      process.exit(0);
    });
  }
}
