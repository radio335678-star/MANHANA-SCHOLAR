import { buildGenerateSystemPrompt } from "./academicPrompt";
import { createKimiCompletion } from "./kimiModelRouter";
import { getPrimaryModel } from "./kimiModels";

export const KIMI_MODEL = getPrimaryModel();

export async function chat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: { maxTokens?: number },
): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY ?? "";
  if (!apiKey) {
    return {
      content:
        "AI assistant is not configured yet. Please set the KIMI_API_KEY environment variable to enable AI features.",
      tokensUsed: 0,
    };
  }

  const { result: response } = await createKimiCompletion({
    messages,
    max_tokens: options?.maxTokens ?? 8192,
    temperature: 0.7,
  });

  const choice = response.choices[0];
  return {
    content: choice?.message?.content ?? "",
    tokensUsed: response.usage?.total_tokens ?? 0,
  };
}

export async function generateContent(
  prompt: string,
  context: {
    workspaceTitle: string;
    sectionTitle: string;
    sectionType: string;
    domain: string;
    qualification: string;
    tone?: string;
    wordLimit?: number;
    contextBlock?: string;
    vaultResourceCount?: number;
  },
): Promise<{ content: string; tokensUsed: number }> {
  const toneMap: Record<string, string> = {
    academic: "formal academic prose suitable for a medical thesis",
    concise: "concise and precise language",
    detailed: "comprehensive and detailed academic prose",
    formal: "highly formal scholarly English",
  };

  const toneDesc = toneMap[context.tone ?? "academic"] ?? toneMap.academic;
  const wordHint = context.wordLimit
    ? ` Target approximately ${context.wordLimit} words.`
    : "";

  const systemPrompt = buildGenerateSystemPrompt({
    qualification: context.qualification,
    domain: context.domain,
    toneDesc,
    wordHint,
    contextBlock: context.contextBlock,
    vaultResourceCount: context.vaultResourceCount,
  });

  return chat(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `I am writing the "${context.sectionTitle}" section (${context.sectionType}) of my thesis titled "${context.workspaceTitle}".\n\n${prompt}`,
      },
    ],
    { maxTokens: context.wordLimit ? Math.ceil(context.wordLimit * 1.5) : 8192 },
  );
}
