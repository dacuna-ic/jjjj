import { Command, Flags } from "@oclif/core";
import { render, useInput } from "ink";
import { Box, Text } from "ink";
import React, { useState, useEffect, useRef } from "react";
import { $ } from "zx";

const useInterval = (callback: () => void, delay: number) => {
  const [tick, setTick] = useState(0);
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
    callback();
  }, [callback]);

  useEffect(() => {
    const id = setTimeout(() => {
      savedCallback.current();
      setTick((tick + 1) % 2);
    }, delay);

    return () => clearTimeout(id);
  }, [tick, delay]);

  return tick;
};

const useLog = (revisions: string) => {
  const [log, setLog] = useState("");

  useInterval(() => {
    const out = $.sync`jj --quiet --color always -r ${revisions}`.text();
    setLog(out.trim());
  }, 1000);

  return log;
};

const App = ({ revisions }: { revisions: string }) => {
  useEffect(() => {
    console.clear();
  }, []);

  useInput((input) => {
    if (input === "q") {
      process.exit(0);
    }
  });
  const log = useLog(revisions);

  return (
    <Box flexDirection="column">
      <Text>{log}</Text>
    </Box>
  );
};

export default class Livelog extends Command {
  static override description = "Live log of jj revisions";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --stack",
    '<%= config.bin %> <%= command.id %> -r "fork_point(trunk())::@"',
  ];

  static override flags = {
    revisions: Flags.string({
      char: "r",
      description: "revision set to display",
    }),
    stack: Flags.boolean({
      description: "show stack from fork point to current",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Livelog);

    const stack = flags.stack ? "fork_point(trunk())::@" : undefined;
    const revisions = flags.revisions || stack || "fork_point(trunk())::descendants(mutable())";

    const r = render(<App revisions={revisions} />, {});

    process.on("SIGINT", () => {
      r.unmount();
      process.exit(0);
    });
  }
}
