import OpenAI from "openai";
import { logger } from "./logger";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY ?? "";
  if (!apiKey) {
    logger.warn("KIMI_API_KEY / MOONSHOT_API_KEY not set — AI features will return an error");
  }
  _client = new OpenAI({
    apiKey: apiKey || "placeholder",
    baseURL: "https://api.moonshot.ai/v1",
  });
  return _client;
}

export const KIMI_MODEL = "moonshot-v1-8k";

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

  const client = getClient();
  const response = await client.chat.completions.create({
    model: KIMI_MODEL,
    messages,
    max_tokens: options?.maxTokens ?? 2048,
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

  const systemPrompt = `You are a scholarly writing assistant specializing in Indian medical research.
You help ${context.qualification} scholars in ${context.domain} medicine write high-quality thesis content.
Write in ${toneDesc}.${wordHint}
Follow standard academic thesis conventions. Cite placeholders like [Author, Year] where references would go.
Do not use emojis. Write with precision, clarity, and authority appropriate for a medical thesis.`;

  return chat(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `I am writing the "${context.sectionTitle}" section (${context.sectionType}) of my thesis titled "${context.workspaceTitle}".\n\n${prompt}`,
      },
    ],
    { maxTokens: context.wordLimit ? Math.ceil(context.wordLimit * 1.5) : 2048 },
  );
}
