import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pino } from "pino";

// Get the directory of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create logs directory in the project root
const logsDir = path.resolve(__dirname, "..", "logs");

// Ensure logs directory exists
fs.mkdirSync(logsDir, { recursive: true });

// Log file path
const logFilePath = path.join(logsDir, "logs.log");

// Create logger instance
export const logger = pino(
	{
		level: process.env.LOG_LEVEL || "debug",
	},
	pino.destination({ dest: logFilePath }),
);

// Create a namespaced logger
export const createLogger = (namespace: string) => {
	return logger.child({ namespace });
};

// Ensure logs are flushed on exit
process.on("exit", () => {
	logger.flush();
});
