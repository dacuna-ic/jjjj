import { spawn } from "node:child_process";

export const runJj = () =>
	new Promise(() => {
		const child = spawn("jj", process.argv.slice(2), {
			stdio: "inherit",
			shell: false,
		});
		// Handle process exit
		child?.on("exit", (code: number) => {
			process.exit(code);
		});
	});
