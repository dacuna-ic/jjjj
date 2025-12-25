import { fs, $ } from "zx";
const configName = ".jjjjrc.json";
let loadedConfig = {};
const configPaths = [
  `/home/${process.env.USER}/.config/${configName}`,
  `/Users/${process.env.USER}/.config/${configName}`,
  `/home/${process.env.USER}/${configName}`,
  `/Users/${process.env.USER}/${configName}`,
];

for (const path of configPaths) {
  try {
    loadedConfig = await fs.readJSON(path);
    break; // Use the first one that resolves
  } catch (_err) {
    // Ignore and try next
  }
}

type Config = {
  openAIBaseURL: string | undefined;
  openAIApiKey: string | undefined;
  githubToken: string | undefined;
};

export const config = Object.assign(
  {
    openAIBaseURL: undefined,
    openAIApiKey: undefined,
    githubToken: undefined,
  },
  loadedConfig,
) as Config;

if (!config.githubToken) {
  config.githubToken = await $`gh auth token`.text();
}
