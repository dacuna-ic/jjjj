import OpenAI from "openai";
import { config } from "../../../lib/config.js";

const openai = new OpenAI({
  baseURL: config.openAIBaseURL,
  apiKey: config.openAIApiKey,
});

const instructions = `You are a helpful describer assistant that provides accurate descriptions of changes in a diff.

Your primary function is to help users get descriptions of changes in a diff. When responding:
- Generate up to 5 descriptions, each separated by a single new line, and no additional output. Sort them by relevance.
- Try to summarize all changes as much as possible, for instance, if a model and its controller are changed, you could describe as "update X model and controller" or "add stack and revisions arguments"
- Include relevant details like changes, additions, and removals
- The result should be maximum around 5 words, but aim for less if at all possible.
- Use conventional commits for starting the decription, for instance 'feat: add new feature' or 'fix: fix bug'. Valid types: build:, chore:, ci:, docs:, style:, refactor:, perf:, test:, cleanup:
- The description should be in the present tense
- Use only lowercase letters
- Try to take into account the whole diff when describing the changes
- Ignore whitespace changes if there are other changes that could be more relevant or meaningful

The user may now add some extra context, to further focus on what the result should be.`;

export async function describeChanges(
  diff: string,
  context?: string
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: instructions },
        {
          role: "user",
          content: context
            ? `Here is the diff:\n\n${diff}\n\nAdditional context: ${context}`
            : `Here is the diff:\n\n${diff}`,
        },
      ],
    });

    return (
      completion.choices[0]?.message?.content || "No description generated"
    );
  } catch (error) {
    console.error("Error generating description:", error);
    throw error;
  }
}
