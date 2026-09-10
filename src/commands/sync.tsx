import { Command, Flags } from "@oclif/core";
import { Box, Text, render } from "ink";
import React, { useState, useEffect } from "react";
import { RevisionDisplay } from "../components/RevisionState.js";
import { getGhConstants } from "../lib/github.js";
import type { Revision } from "../lib/types.js";
import { PRState, useStackEvent } from "../lib/useStackEvents.js";
import { syncRevisions } from "../services/sync.js";

type SyncRevisionState = {
  state: PRState;
  prNumber?: number;
};

const getLabel = (state: PRState) => {
  if (state === PRState.PENDING) return "Pending";
  if (state === PRState.CREATED) return "Created";
  if (state === PRState.SKIPPED) return "Skipped";
  if (state === PRState.UPDATED) return "Updated";
  if (state === PRState.DELETED) return "Deleted";
  if (state === PRState.SYNCING) return "Syncing";
  return "Unknown";
};

const getColor = (state: PRState) => {
  if (state === PRState.PENDING || state === PRState.SYNCING) return "gray";
  if (state === PRState.CREATED || state === PRState.UPDATED) return "green";
  if (state === PRState.DELETED) return "red";
  return "yellow";
};

const SyncRevisionDisplay = ({
  rev,
  owner,
  repo,
}: {
  rev: Revision;
  owner: string;
  repo: string;
}) => {
  const [status, setStatus] = useState<SyncRevisionState>({ state: PRState.PENDING });

  useStackEvent("update", (event) => {
    if (event.rev.changeId !== rev.changeId) return;

    setStatus({ state: event.state, prNumber: event.prNumber });
  });

  const { state, prNumber } = status;

  return (
    <RevisionDisplay
      rev={rev}
      label={getLabel(state)}
      color={getColor(state)}
      statusCharacter={state === PRState.PENDING || state === PRState.SYNCING ? "○" : "●"}
      description={
        <Text>
          <Text>{rev.description}</Text>
          {prNumber && (
            <Text>
              <Text> · </Text>
              <Text color="yellow">#{prNumber} </Text>
              <Text>
                https://github.com/{owner}/{repo}/pull/{prNumber}
              </Text>
            </Text>
          )}
        </Text>
      }
    />
  );
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
  const [revisionsToSync, setRevisionsToSync] = useState<Revision[]>([]);

  useEffect(() => {
    void syncRevisions(revisions, abandonMerged);
  }, [revisions, abandonMerged]);

  useStackEvent("init", (revs) => {
    setRevisionsToSync([...revs].reverse());
  });

  return (
    <Box flexDirection="column">
      {revisionsToSync.map((rev) => (
        <SyncRevisionDisplay key={rev.changeId} rev={rev} owner={owner} repo={repo} />
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
