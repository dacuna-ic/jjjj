import crypto from "node:crypto";
import path from "node:path";
import { fs, os } from "zx";
import { getRepoRoot } from "./repo.js";

export const withCache = async <T>(
  key: string,
  fn: () => T | Promise<T>,
  maxAge: number = 5 * 60 * 1000, // 5 minutes default
): Promise<T> => {
  const repoRoot = await getRepoRoot();
  const repoHash = crypto.createHash("md5").update(repoRoot).digest("hex").substring(0, 8);

  const cacheDir = path.join(os.tmpdir(), "jj-cache", repoHash);
  const cacheFile = path.join(cacheDir, `${key}.json`);

  try {
    // Check if cache file exists and is recent
    const stats = await fs.stat(cacheFile);
    const isRecent = Date.now() - stats.mtime.getTime() < maxAge;

    if (isRecent) {
      const cachedData = await import(cacheFile);
      return cachedData;
    }
  } catch (error) {
    // Cache file doesn't exist or can't be read, continue to fetch fresh data
  }

  // Execute function to get fresh data
  const result = await fn();

  try {
    // Ensure cache directory exists and save the data
    await fs.ensureDir(cacheDir);
    await fs.writeJSON(cacheFile, result);
  } catch (error) {
    // If we can't write to cache, continue without caching
    console.warn(`Could not write ${key} to cache:`, error);
  }

  return result;
};
